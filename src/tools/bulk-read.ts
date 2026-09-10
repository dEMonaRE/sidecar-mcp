import { z } from 'zod';
import type { Backend, ChatResponse } from '../backends/types.js';
import { SYSTEM_PROMPT } from '../prompts.js';
import { readFiles } from '../file-reader.js';
import type { Config } from '../config.js';

export const BULK_READ_DESCRIPTION =
  'Read multiple files and ask the worker LLM to summarize them in the context of `question`. Use instead of `Read` for 2+ files or any file >100 lines. Returns the worker summary, never raw file content.';

export const BulkReadInput = z.object({
  paths: z.array(z.string().min(1)).min(1).max(50),
  question: z.string().min(1).max(2000),
  model: z.string().optional(),
});

export type BulkReadArgs = z.infer<typeof BulkReadInput>;

// SDK passes `(args, extra)` where extra contains a cancellation signal.
// Duck-typed to avoid pulling generic RequestHandlerExtra<Req, Notif> into our types.
interface ToolExtra {
  signal?: AbortSignal;
}

export function makeBulkReadHandler(cfg: Config, backend: Backend) {
  return async function handleBulkRead(rawArgs: unknown, extra?: ToolExtra) {
    const parsed = BulkReadInput.safeParse(rawArgs);
    if (!parsed.success) {
      const issues = parsed.error.issues
        .map((i) => `  - ${i.path.join('.') || '(root)'}: ${i.message}`)
        .join('\n');
      throw new Error(`Invalid bulk_read input:\n${issues}`);
    }
    const args = parsed.data;

    const results = await readFiles(args.paths, {
      allowRoots: cfg.allowRoots,
      maxBytes: cfg.fileMaxBytes,
    });

    const oks = results.filter((r) => r.kind === 'ok');
    const skips = results.filter((r): r is Extract<typeof r, { kind: 'skip' }> => r.kind === 'skip');

    if (oks.length === 0) {
      const reasons = skips.map((s) => `  - ${s.path}: ${s.reason}`).join('\n');
      throw new Error(`no readable text files:\n${reasons}`);
    }

    const totalBytes = oks.reduce((n, f) => n + Buffer.byteLength(f.content, 'utf8'), 0);
    if (totalBytes > cfg.totalMaxBytes) {
      throw new Error(
        `prompt would be ${totalBytes} bytes across ${oks.length} files; ` +
          `cap is ${cfg.totalMaxBytes} (SIDECAR_TOTAL_MAX_BYTES). ` +
          `Narrow \`paths\` or raise the cap.`,
      );
    }

    const userPrompt = buildPrompt(oks, skips, args.question);

    const reply = await backend.chat(
      {
        system: SYSTEM_PROMPT,
        user: userPrompt,
        ...(args.model !== undefined ? { model: args.model } : {}),
      },
      extra?.signal,
    );

    const footer = formatUsageFooter(reply, backend.name);

    return {
      content: [
        {
          type: 'text' as const,
          text: `${reply.text}${footer}`,
        },
      ],
    };
  };
}

function formatUsageFooter(reply: ChatResponse, backendName: string): string {
  const u = reply.usage;
  if (!u) {
    return `\n\n---\nsidecar: model=${reply.model}, backend=${backendName}, tokens: n/a`;
  }
  return `\n\n---\nsidecar: model=${reply.model}, backend=${backendName}, tokens: ${u.promptTokens} in / ${u.completionTokens} out`;
}

function buildPrompt(
  oks: Array<{ path: string; content: string }>,
  skips: Array<{ path: string; reason: string }>,
  question: string,
): string {
  const fileBlocks = oks
    .map((f) => `<file path="${escapeAttr(f.path)}">\n${f.content}\n</file>`)
    .join('\n');

  const skipBlock =
    skips.length > 0
      ? skips.map((s) => `<!-- unreadable: ${escapeAttr(s.path)} — ${s.reason} -->`).join('\n') + '\n'
      : '';

  return `<files>
${fileBlocks}
</files>
${skipBlock}<question>
${question}
</question>`;
}

function escapeAttr(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

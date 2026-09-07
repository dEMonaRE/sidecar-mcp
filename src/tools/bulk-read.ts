import { z } from 'zod';
import type { Backend } from '../backends/types.js';
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

export function makeBulkReadHandler(cfg: Config, backend: Backend) {
  return async function handleBulkRead(rawArgs: unknown) {
    const parsed = BulkReadInput.safeParse(rawArgs);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      throw new Error(
        `Invalid bulk_read input: ${issue?.path.join('.') ?? '?'} — ${issue?.message ?? 'unknown'}`,
      );
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

    const userPrompt = buildPrompt(oks, skips, args.question);

    const reply = await backend.chat({
      system: SYSTEM_PROMPT,
      user: userPrompt,
      ...(args.model !== undefined ? { model: args.model } : {}),
    });

    return {
      content: [
        {
          type: 'text' as const,
          text: reply.text,
        },
      ],
    };
  };
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

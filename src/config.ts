import { z } from 'zod';
import type { BackendName } from './backends/types.js';

const BackendNameSchema = z.enum(['ollama', 'openai', 'anthropic', 'fake']);

const LogLevelSchema = z.enum(['error', 'info', 'debug']);

const ConfigSchema = z
  .object({
    backend: BackendNameSchema,
    model: z.string().min(1),
    ollamaUrl: z.string().url(),
    openaiUrl: z.string().url(),
    openaiKey: z.string().optional(),
    anthropicUrl: z.string().url(),
    anthropicKey: z.string().optional(),
    fileMaxBytes: z.coerce.number().int().positive().default(524288),
    totalMaxBytes: z.coerce.number().int().positive().default(5 * 1024 * 1024),
    allowRoots: z.array(z.string().min(1)).min(1),
    requestTimeoutMs: z.coerce.number().int().positive().default(120000),
    logLevel: LogLevelSchema,
  })
  .superRefine((cfg, ctx) => {
    if (cfg.backend === 'openai' && !cfg.openaiKey) {
      ctx.addIssue({
        code: 'custom',
        path: ['openaiKey'],
        message: 'SIDECAR_OPENAI_KEY is required when SIDECAR_BACKEND=openai',
      });
    }
    if (cfg.backend === 'anthropic' && !cfg.anthropicKey) {
      ctx.addIssue({
        code: 'custom',
        path: ['anthropicKey'],
        message: 'SIDECAR_ANTHROPIC_KEY is required when SIDECAR_BACKEND=anthropic',
      });
    }
  });

export type Config = z.infer<typeof ConfigSchema>;

const DEFAULTS: Record<BackendName, string> = {
  ollama: 'llama3.1:8b',
  openai: 'gpt-4o-mini',
  anthropic: 'claude-3-5-haiku-latest',
  fake: 'fake-model',
};

function parseRoots(raw: string | undefined): string[] {
  const fallback = [process.cwd()];
  if (!raw) {
    warnCwdDefault(fallback[0]!);
    return fallback;
  }
  const parts = raw
    .split(',')
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
  if (parts.length === 0) {
    warnCwdDefault(fallback[0]!);
    return fallback;
  }
  return parts;
}

function warnCwdDefault(cwd: string): void {
  // stdout is reserved for MCP JSON-RPC; warn to stderr.
  process.stderr.write(
    `sidecar-mcp: SIDECAR_ALLOW_ROOTS is unset; defaulting to cwd (${cwd}). ` +
      `The worker can read any file under that path, including ~/.ssh, ~/.aws, .env. ` +
      `Set SIDECAR_ALLOW_ROOTS explicitly to scope what the worker sees.\n`,
  );
}

export function loadConfig(): Config {
  const backend = (process.env.SIDECAR_BACKEND ?? 'ollama') as BackendName;
  const parsed = ConfigSchema.safeParse({
    backend,
    model: process.env.SIDECAR_MODEL ?? DEFAULTS[backend],
    ollamaUrl: process.env.SIDECAR_OLLAMA_URL ?? 'http://127.0.0.1:11434',
    openaiUrl: process.env.SIDECAR_OPENAI_URL ?? 'https://api.openai.com',
    openaiKey: process.env.SIDECAR_OPENAI_KEY,
    anthropicUrl: process.env.SIDECAR_ANTHROPIC_URL ?? 'https://api.anthropic.com',
    anthropicKey: process.env.SIDECAR_ANTHROPIC_KEY,
    fileMaxBytes: process.env.SIDECAR_FILE_MAX_BYTES,
    totalMaxBytes: process.env.SIDECAR_TOTAL_MAX_BYTES,
    allowRoots: parseRoots(process.env.SIDECAR_ALLOW_ROOTS),
    requestTimeoutMs: process.env.SIDECAR_REQUEST_TIMEOUT_MS,
    logLevel: process.env.SIDECAR_LOG_LEVEL ?? 'info',
  });
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new Error(`sidecar-mcp config error:\n${issues}`);
  }
  return parsed.data;
}

export function helpText(): string {
  return `sidecar-mcp — env-var configuration

  SIDECAR_BACKEND           ollama (default) | openai | anthropic | fake
  SIDECAR_MODEL             override default model for the active backend
                            defaults: ollama=llama3.1:8b  openai=gpt-4o-mini
                                     anthropic=claude-3-5-haiku-latest

  SIDECAR_OLLAMA_URL        default http://127.0.0.1:11434
  SIDECAR_OPENAI_URL        default https://api.openai.com  (any OpenAI-compat)
  SIDECAR_OPENAI_KEY        required when SIDECAR_BACKEND=openai
  SIDECAR_ANTHROPIC_URL     default https://api.anthropic.com  (Anthropic-compat)
  SIDECAR_ANTHROPIC_KEY     required when SIDECAR_BACKEND=anthropic

  SIDECAR_FILE_MAX_BYTES    default 524288 (512 KB) — files larger are skipped
  SIDECAR_TOTAL_MAX_BYTES   default 5242880 (5 MB) — bulk_read errors if total
                            bytes across all readable files exceeds this cap
  SIDECAR_ALLOW_ROOTS       comma-separated absolute paths; default = cwd
                            (warns on stderr at boot; set explicitly for non-dev use)
  SIDECAR_REQUEST_TIMEOUT_MS default 120000
  SIDECAR_LOG_LEVEL         error | info (default) | debug

Examples:
  SIDECAR_BACKEND=ollama                                  # local Ollama
  SIDECAR_BACKEND=openai  SIDECAR_OPENAI_KEY=sk-...       # OpenAI
  SIDECAR_BACKEND=anthropic SIDECAR_ANTHROPIC_KEY=sk-ant-...  # Anthropic-compatible
`;
}

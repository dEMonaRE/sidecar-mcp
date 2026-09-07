#!/usr/bin/env node
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { helpText, loadConfig } from './config.js';
import { buildServer } from './server.js';
import { createOllamaBackend } from './backends/ollama.js';
import { createOpenAIBackend } from './backends/openai.js';
import { createAnthropicBackend } from './backends/anthropic.js';
import { createFakeBackend } from './backends/fake.js';
import type { Backend } from './backends/types.js';

function selectBackend(cfg: ReturnType<typeof loadConfig>): Backend {
  switch (cfg.backend) {
    case 'ollama':
      return createOllamaBackend({
        baseUrl: cfg.ollamaUrl,
        defaultModel: cfg.model,
        requestTimeoutMs: cfg.requestTimeoutMs,
      });
    case 'openai':
      // Config schema enforces openaiKey is present when backend=openai.
      return createOpenAIBackend({
        baseUrl: cfg.openaiUrl,
        defaultModel: cfg.model,
        apiKey: cfg.openaiKey!,
        requestTimeoutMs: cfg.requestTimeoutMs,
      });
    case 'anthropic':
      return createAnthropicBackend({
        baseUrl: cfg.anthropicUrl,
        defaultModel: cfg.model,
        apiKey: cfg.anthropicKey!,
        requestTimeoutMs: cfg.requestTimeoutMs,
      });
    case 'fake':
      return createFakeBackend();
  }
}

async function main(): Promise<void> {
  if (process.argv.includes('--help') || process.argv.includes('-h')) {
    process.stderr.write(helpText() + '\n');
    process.exit(0);
  }

  const cfg = loadConfig();
  const backend = selectBackend(cfg);
  const server = buildServer(cfg, backend);

  const transport = new StdioServerTransport();
  await server.connect(transport);

  // Keep process alive; transport owns the lifecycle.
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  await new Promise<never>(() => {});
}

main().catch((err: unknown) => {
  process.stderr.write(`sidecar-mcp fatal: ${(err as Error).message}\n`);
  process.exit(1);
});

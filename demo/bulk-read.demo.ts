/**
 * Self-check for sidecar-mcp. No network.
 *
 *   pnpm demo
 *
 * Builds a real handler with the `fake` backend, calls bulk_read against
 * three demo fixtures (text service, small text, binary), prints the prompt
 * that would be sent and the fake worker's reply. Exits non-zero on any
 * thrown error. ponytail: the one runnable check per the project rule.
 */
import { resolve } from 'node:path';
import { createFakeBackend } from '../src/backends/fake.js';
import { makeBulkReadHandler } from '../src/tools/bulk-read.js';
import type { Config } from '../src/config.js';

const fixturesDir = resolve(import.meta.dirname, 'fixtures');

const cfg: Config = {
  backend: 'fake',
  model: 'fake-model',
  ollamaUrl: 'http://localhost:11434',
  openaiUrl: 'https://api.openai.com',
  anthropicUrl: 'https://api.anthropic.com',
  fileMaxBytes: 1024 * 1024,
  allowRoots: [fixturesDir],
  requestTimeoutMs: 5000,
  logLevel: 'info',
};

async function main(): Promise<void> {
  const backend = createFakeBackend({
    reply: '## Summary\n- service.java defines UserService with create(email, name).\n- small.txt is a placeholder text file.\n- binary.bin was skipped (binary file).\n\n## Relevant code excerpts\n```java\npublic User create(String email, String name) { ... }\n```',
  });
  const handler = makeBulkReadHandler(cfg, backend);

  const paths = [
    resolve(fixturesDir, 'service.java'),
    resolve(fixturesDir, 'small.txt'),
    resolve(fixturesDir, 'binary.bin'),
  ];

  process.stderr.write('sidecar-mcp demo\n');
  process.stderr.write(`  fixtures dir: ${fixturesDir}\n`);
  process.stderr.write(`  paths: ${paths.length}\n\n`);

  const result = await handler({ paths, question: 'Summarize these files in 3 bullets.' });

  const prompt = backend.calls[0]?.user ?? '(no call recorded)';
  process.stderr.write('──── prompt that would be sent to worker ────\n');
  process.stdout.write(prompt + '\n');
  process.stderr.write('──── /prompt ────\n\n');

  process.stderr.write('──── worker reply ────\n');
  process.stdout.write(result.content[0]?.text + '\n');
  process.stderr.write('──── /reply ────\n');

  process.stderr.write('\nOK\n');
}

main().catch((err: unknown) => {
  process.stderr.write(`demo failed: ${(err as Error).message}\n`);
  process.exit(1);
});

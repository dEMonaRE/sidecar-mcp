import { describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createFakeBackend } from '../src/backends/fake.js';
import { makeBulkReadHandler } from '../src/tools/bulk-read.js';
import type { Config } from '../src/config.js';

function makeCfg(allowRoots: string[]): Config {
  return {
    backend: 'fake',
    model: 'fake-model',
    ollamaUrl: 'http://localhost:11434',
    openaiUrl: 'https://api.openai.com',
    anthropicUrl: 'https://api.anthropic.com',
    fileMaxBytes: 1024,
    allowRoots,
    requestTimeoutMs: 5000,
    logLevel: 'info',
  };
}

describe('bulk_read handler (integration)', () => {
  it('reads files, builds prompt, returns tool result', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'sidecar-int-'));
    try {
      const a = join(dir, 'a.txt');
      const b = join(dir, 'b.txt');
      writeFileSync(a, 'aaa');
      writeFileSync(b, 'bbb');

      const backend = createFakeBackend({ reply: 'fake summary' });
      const handler = makeBulkReadHandler(makeCfg([dir]), backend);

      const result = await handler({ paths: [a, b], question: 'what?' });

      const text = result.content[0]!.text;
      expect(text.startsWith('fake summary')).toBe(true);
      expect(text).toMatch(/\n\n---\nsidecar:/);
      expect(backend.calls).toHaveLength(1);
      const prompt = backend.calls[0]!.user;
      expect(prompt).toContain(`<file path="${a}">`);
      expect(prompt).toContain(`<file path="${b}">`);
      expect(prompt).toContain('aaa');
      expect(prompt).toContain('bbb');
      expect(prompt).toContain('<question>\nwhat?\n</question>');
      expect(backend.calls[0]!.system).toMatch(/read-only code analyst/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('honors per-call model override', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'sidecar-int-'));
    try {
      const f = join(dir, 'a.txt');
      writeFileSync(f, 'x');

      const backend = createFakeBackend();
      const handler = makeBulkReadHandler(makeCfg([dir]), backend);
      await handler({ paths: [f], question: 'q', model: 'big-model' });

      expect(backend.calls[0]!.model).toBe('big-model');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('throws when all paths are unreadable', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'sidecar-int-'));
    try {
      const backend = createFakeBackend();
      const handler = makeBulkReadHandler(makeCfg([dir]), backend);
      await expect(handler({ paths: [join(dir, 'nope.txt')], question: 'q' })).rejects.toThrow(
        /no readable text files/,
      );
      expect(backend.calls).toHaveLength(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('appends a usage footer with model + backend name', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'sidecar-int-'));
    try {
      const f = join(dir, 'a.txt');
      writeFileSync(f, 'x');

      const backend = createFakeBackend({ reply: 'body' });
      const handler = makeBulkReadHandler(makeCfg([dir]), backend);
      const result = await handler({ paths: [f], question: 'q' });

      const text = result.content[0]!.text;
      expect(text).toMatch(/^body\n\n---\nsidecar: model=fake-model, backend=fake, tokens: n\/a$/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('XML-escapes path strings in skip blocks (escapeAttr)', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'sidecar-int-'));
    try {
      // Real file alongside a path containing XML-special chars (will be skipped as not-found).
      const real = join(dir, 'a.txt');
      writeFileSync(real, 'x');
      const evil = '</file><script>alert("x")</script>';

      const backend = createFakeBackend({ reply: 'r' });
      const handler = makeBulkReadHandler(makeCfg([dir]), backend);
      await handler({ paths: [real, evil], question: 'q' });

      const prompt = backend.calls[0]!.user;
      // Raw angle brackets / quotes must not appear inside an attribute value
      // or anywhere they'd break out of the XML structure.
      expect(prompt).not.toContain('</file><script>');
      expect(prompt).toContain('&lt;/file&gt;');
      expect(prompt).toContain('&quot;');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

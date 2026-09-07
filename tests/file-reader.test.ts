import { describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readFiles } from '../src/file-reader.js';

function makeTmpDir(): string {
  return mkdtempSync(join(tmpdir(), 'sidecar-test-'));
}

describe('readFiles', () => {
  it('reads a small text file under allowed root', async () => {
    const dir = makeTmpDir();
    try {
      const file = join(dir, 'a.txt');
      writeFileSync(file, 'hello');
      const results = await readFiles([file], { allowRoots: [dir], maxBytes: 1024 });
      expect(results).toEqual([{ kind: 'ok', path: file, content: 'hello' }]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('skips a binary file (NUL byte in first 8 KB)', async () => {
    const dir = makeTmpDir();
    try {
      const file = join(dir, 'blob.bin');
      writeFileSync(file, Buffer.from([0x00, 0x01, 0x02]));
      const results = await readFiles([file], { allowRoots: [dir], maxBytes: 1024 });
      expect(results).toHaveLength(1);
      expect(results[0]?.kind).toBe('skip');
      if (results[0]?.kind === 'skip') {
        expect(results[0].reason).toMatch(/binary/i);
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('skips an oversize file', async () => {
    const dir = makeTmpDir();
    try {
      const file = join(dir, 'big.txt');
      writeFileSync(file, 'x'.repeat(2048));
      const results = await readFiles([file], { allowRoots: [dir], maxBytes: 1024 });
      expect(results[0]?.kind).toBe('skip');
      if (results[0]?.kind === 'skip') {
        expect(results[0].reason).toMatch(/exceeds limit/);
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('rejects a path outside allowed roots', async () => {
    const allowed = makeTmpDir();
    const outside = makeTmpDir();
    try {
      const file = join(outside, 'a.txt');
      writeFileSync(file, 'hello');
      const results = await readFiles([file], { allowRoots: [allowed], maxBytes: 1024 });
      expect(results[0]?.kind).toBe('skip');
      if (results[0]?.kind === 'skip') {
        expect(results[0].reason).toMatch(/outside allowed roots/);
      }
    } finally {
      rmSync(allowed, { recursive: true, force: true });
      rmSync(outside, { recursive: true, force: true });
    }
  });

  it('skips a missing file with stat error', async () => {
    const dir = makeTmpDir();
    try {
      const results = await readFiles([join(dir, 'nope.txt')], {
        allowRoots: [dir],
        maxBytes: 1024,
      });
      expect(results[0]?.kind).toBe('skip');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

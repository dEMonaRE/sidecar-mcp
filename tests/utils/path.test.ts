import { describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { isPathInside, realpathSafe } from '../../src/utils/path.js';

describe('isPathInside (lexical)', () => {
  it('returns true when child is strictly inside parent', () => {
    expect(isPathInside('/a/b/c', '/a')).toBe(true);
  });

  it('returns true when child equals parent', () => {
    expect(isPathInside('/a', '/a')).toBe(true);
  });

  it('returns false when child is a sibling', () => {
    expect(isPathInside('/b/c', '/a')).toBe(false);
  });

  it('returns false when child is shallower than parent', () => {
    expect(isPathInside('/a', '/a/b')).toBe(false);
  });

  it('handles trailing separators on parent', () => {
    expect(isPathInside('/a/b', '/a/')).toBe(true);
  });

  it('handles trailing separators on child', () => {
    expect(isPathInside('/a/b/', '/a')).toBe(true);
  });

  it('collapses .. segments', () => {
    expect(isPathInside('/a/b/../b/c', '/a')).toBe(true);
  });

  it('does not mistake prefix names for containment', () => {
    expect(isPathInside('/abc', '/a')).toBe(false);
  });
});

describe('realpathSafe', () => {
  function makeTmpDir(): string {
    return mkdtempSync(join(tmpdir(), 'sidecar-pathtest-'));
  }

  it('returns the canonical path for an existing file', async () => {
    const dir = makeTmpDir();
    try {
      const f = join(dir, 'a.txt');
      writeFileSync(f, 'x');
      // On macOS, $TMPDIR is under /var/folders which is a symlink to /private/var/folders.
      // realpath returns the canonical form, not the lexical one.
      const canonical = await realpathSafe(f);
      expect(canonical.endsWith('/a.txt')).toBe(true);
      expect(canonical).not.toMatch(/\/{2,}/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('falls back to lexical resolve for a missing path', async () => {
    const dir = makeTmpDir();
    try {
      const missing = join(dir, 'nope.txt');
      const r = await realpathSafe(missing);
      // Lexical resolve gives the absolute path; realpath would throw.
      expect(r).toBe(missing);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('resolves through a symlink to its real target', async () => {
    const dir = makeTmpDir();
    try {
      const inner = join(dir, 'inner');
      mkdirSync(inner);
      const target = join(inner, 'real.txt');
      writeFileSync(target, 'x');
      const link = join(inner, 'link.txt');
      symlinkSync(target, link);
      const resolved = await realpathSafe(link);
      // Compare via realpath of target to handle macOS /var → /private/var prefix.
      expect(resolved).toBe(await realpathSafe(target));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('symlink-escape containment', () => {
  function makeTmpDir(): string {
    return mkdtempSync(join(tmpdir(), 'sidecar-symtest-'));
  }

  it('a symlink inside allowRoot that points outside is rejected by realpath', async () => {
    const allowed = makeTmpDir();
    const outside = makeTmpDir();
    try {
      const real = join(outside, 'secret.txt');
      writeFileSync(real, 'shhh');
      const link = join(allowed, 'sneaky.txt');
      symlinkSync(real, link);

      const childReal = await realpathSafe(link);
      const rootReal = await realpathSafe(allowed);
      expect(isPathInside(childReal, rootReal)).toBe(false);
    } finally {
      rmSync(allowed, { recursive: true, force: true });
      rmSync(outside, { recursive: true, force: true });
    }
  });
});
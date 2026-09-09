import { readFile, realpath, stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { isPathInside, realpathSafe } from './utils/path.js';

export type FileResult =
  | { kind: 'ok'; path: string; content: string }
  | { kind: 'skip'; path: string; reason: string };

export interface ReadOptions {
  allowRoots: string[];
  maxBytes: number;
}

const BINARY_PEEK_BYTES = 8192;

export async function readFiles(paths: string[], opts: ReadOptions): Promise<FileResult[]> {
  return Promise.all(paths.map((rawPath) => readOne(rawPath, opts)));
}

async function readOne(rawPath: string, opts: ReadOptions): Promise<FileResult> {
  const abs = resolve(rawPath);

  // Cheap lexical rejection first — no I/O for obviously-bad paths.
  const lexicallyInside = opts.allowRoots.some((root) => isPathInside(abs, resolve(root)));
  if (!lexicallyInside) {
    return { kind: 'skip', path: rawPath, reason: 'path outside allowed roots' };
  }

  let size: number;
  try {
    const st = await stat(abs);
    size = st.size;
  } catch (err) {
    return { kind: 'skip', path: rawPath, reason: `stat failed: ${(err as Error).message}` };
  }

  // Symlink-escape check: the lexical path can pass while the realpath target
  // points outside allowRoots. Resolve and re-check.
  let canonical: string;
  try {
    canonical = await realpath(abs);
  } catch (err) {
    return { kind: 'skip', path: rawPath, reason: `realpath failed: ${(err as Error).message}` };
  }
  const realRoots = await Promise.all(opts.allowRoots.map(realpathSafe));
  if (!realRoots.some((root) => isPathInside(canonical, root))) {
    return {
      kind: 'skip',
      path: rawPath,
      reason: 'path resolves outside allowed roots (symlink escape)',
    };
  }

  if (size === 0) {
    return { kind: 'ok', path: rawPath, content: '' };
  }

  if (size > opts.maxBytes) {
    return {
      kind: 'skip',
      path: rawPath,
      reason: `file size ${size} exceeds limit ${opts.maxBytes}`,
    };
  }

  let buf: Buffer;
  try {
    buf = await readFile(canonical);
  } catch (err) {
    return { kind: 'skip', path: rawPath, reason: `read failed: ${(err as Error).message}` };
  }

  if (isBinary(buf)) {
    return { kind: 'skip', path: rawPath, reason: 'binary file (NUL byte in first 8 KB)' };
  }

  let content: string;
  try {
    content = buf.toString('utf8');
  } catch {
    return { kind: 'skip', path: rawPath, reason: 'invalid UTF-8' };
  }

  return { kind: 'ok', path: rawPath, content };
}

/**
 * Cheap binary detection: any NUL byte in the first 8 KB.
 * ponytail: heuristic. Good enough for source-code use case. Upgrade path:
 * `file-type` package or libmagic for real detection.
 */
function isBinary(buf: Buffer): boolean {
  const len = Math.min(buf.length, BINARY_PEEK_BYTES);
  for (let i = 0; i < len; i++) {
    if (buf[i] === 0) return true;
  }
  return false;
}

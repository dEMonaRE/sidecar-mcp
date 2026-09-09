import { realpath } from 'node:fs/promises';
import { resolve } from 'node:path';

/**
 * Is `child` inside `parent` (or equal)?
 * Both must be absolute, resolved paths. Lexical check only — does not follow symlinks.
 */
export function isPathInside(child: string, parent: string): boolean {
  const c = resolve(child).split('/');
  const p = resolve(parent).split('/');
  if (c.length < p.length) return false;
  for (let i = 0; i < p.length; i++) {
    if (c[i] !== p[i]) return false;
  }
  return true;
}

/**
 * Resolve a path to its canonical (symlink-resolved) form.
 * Falls back to lexical resolve if realpath fails (broken link, missing dir).
 */
export async function realpathSafe(p: string): Promise<string> {
  try {
    return await realpath(p);
  } catch {
    return resolve(p);
  }
}

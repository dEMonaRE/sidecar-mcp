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

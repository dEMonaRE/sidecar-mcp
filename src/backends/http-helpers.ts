import { BackendError } from './types.js';

/**
 * Combine multiple AbortSignals into one — fires when any of them fires.
 * ponytail: listener leak under heavy cancellation is GC'd once the controller
 * goes out of scope. Upgrade if you see long-running memory growth.
 */
export function anySignal(signals: AbortSignal[]): AbortSignal {
  const ctrl = new AbortController();
  const onAbort = () => ctrl.abort();
  for (const s of signals) {
    if (s.aborted) {
      ctrl.abort();
      break;
    }
    s.addEventListener('abort', onAbort, { once: true });
  }
  return ctrl.signal;
}

/** Best-effort response body for error messages. Never throws. */
export async function safeText(res: Response): Promise<string> {
  try {
    return await res.text();
  } catch {
    return '<no body>';
  }
}

/**
 * Map an HTTP status + body to a BackendError. Shared shape across all
 * real backends; only the message prefix differs.
 */
export function makeMapHttpError(prefix: string): (status: number, body: string) => BackendError {
  return (status: number, body: string): BackendError => {
    if (status === 401 || status === 403) {
      return new BackendError('auth', `${prefix} auth failed (${status}): ${body}`, status);
    }
    if (status === 429) {
      return new BackendError('rate_limit', `${prefix} rate-limited (${status}): ${body}`, status);
    }
    return new BackendError('http', `${prefix} HTTP ${status}: ${body}`, status);
  };
}
import { vi } from 'vitest';

/**
 * A fetch mock that respects the AbortSignal — rejects with AbortError
 * when the signal fires. Use to test backend timeout/cancellation behavior.
 */
export function abortableFetchMock(): ReturnType<typeof vi.fn> {
  return vi.fn((_url: string | URL | Request, init?: RequestInit) =>
    new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => {
        reject(new DOMException('Aborted', 'AbortError'));
      });
    }),
  );
}
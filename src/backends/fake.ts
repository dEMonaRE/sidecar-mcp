import type { Backend, ChatRequest, ChatResponse } from './types.js';

/**
 * In-memory backend used by tests and `pnpm demo`.
 * Records every request and returns a canned response.
 */
export interface FakeBackend extends Backend {
  readonly calls: ChatRequest[];
  /** Programmable canned reply. */
  setReply(reply: string): void;
}

export function createFakeBackend(opts?: { reply?: string }): FakeBackend {
  const calls: ChatRequest[] = [];
  let reply = opts?.reply ?? 'Summary\n- (fake worker response)';

  const backend: FakeBackend = {
    name: 'fake',
    calls,
    setReply(next: string) {
      reply = next;
    },
    async chat(req: ChatRequest): Promise<ChatResponse> {
      calls.push(req);
      return { text: reply, model: req.model ?? 'fake-model' };
    },
  };
  return backend;
}

import { afterEach, describe, expect, it, vi } from 'vitest';
import { createOllamaBackend } from '../src/backends/ollama.js';
import { BackendError } from '../src/backends/types.js';

const cfg = { baseUrl: 'http://localhost:11434', defaultModel: 'llama3.1:8b', requestTimeoutMs: 5000 };

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Ollama backend', () => {
  it('happy path: parses /api/chat reply and returns content', async () => {
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({
          model: 'llama3.1:8b',
          message: { role: 'assistant', content: 'Summary: works.' },
          prompt_eval_count: 100,
          eval_count: 25,
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    const backend = createOllamaBackend(cfg);
    const res = await backend.chat({ system: 'sys', user: 'q' });
    expect(res.text).toBe('Summary: works.');
    expect(res.model).toBe('llama3.1:8b');
    expect(res.usage).toEqual({ promptTokens: 100, completionTokens: 25 });

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('http://localhost:11434/api/chat');
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.stream).toBe(false);
    expect(body.messages).toEqual([
      { role: 'system', content: 'sys' },
      { role: 'user', content: 'q' },
    ]);
  });

  it('error mapping: 401 → BackendError kind=auth', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('unauthorized', { status: 401 })),
    );
    const backend = createOllamaBackend(cfg);
    await expect(backend.chat({ system: 's', user: 'q' })).rejects.toMatchObject({
      name: 'BackendError',
      kind: 'auth',
      status: 401,
    });
  });
});

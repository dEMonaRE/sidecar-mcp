import { afterEach, describe, expect, it, vi } from 'vitest';
import { createOpenAIBackend } from '../src/backends/openai.js';

const cfg = {
  baseUrl: 'https://api.openai.com',
  defaultModel: 'gpt-4o-mini',
  apiKey: 'sk-test',
  requestTimeoutMs: 5000,
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('OpenAI backend', () => {
  it('happy path: sends Bearer auth, parses choices[0].message.content', async () => {
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({
          model: 'gpt-4o-mini',
          choices: [{ message: { role: 'assistant', content: 'OK' } }],
          usage: { prompt_tokens: 50, completion_tokens: 10 },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    const backend = createOpenAIBackend(cfg);
    const res = await backend.chat({ system: 's', user: 'q' });
    expect(res.text).toBe('OK');
    expect(res.usage).toEqual({ promptTokens: 50, completionTokens: 10 });

    const [, init] = fetchMock.mock.calls[0]!;
    const headers = (init as RequestInit).headers as Record<string, string>;
    expect(headers.authorization).toBe('Bearer sk-test');
  });

  it('error mapping: 429 → kind=rate_limit', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('over quota', { status: 429 })));
    const backend = createOpenAIBackend(cfg);
    await expect(backend.chat({ system: 's', user: 'q' })).rejects.toMatchObject({
      name: 'BackendError',
      kind: 'rate_limit',
    });
  });
});

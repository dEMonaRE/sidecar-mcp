import { afterEach, describe, expect, it, vi } from 'vitest';
import { createAnthropicBackend } from '../src/backends/anthropic.js';
import { abortableFetchMock } from './abort-helper.js';

const cfg = {
  baseUrl: 'https://api.anthropic.com',
  defaultModel: 'claude-3-5-haiku-latest',
  apiKey: 'sk-ant-test',
  requestTimeoutMs: 5000,
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Anthropic backend', () => {
  it('happy path: sends x-api-key + anthropic-version, parses content[0].text', async () => {
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({
          model: 'claude-3-5-haiku-latest',
          content: [{ type: 'text', text: 'Summary here.' }],
          usage: { input_tokens: 80, output_tokens: 20 },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    const backend = createAnthropicBackend(cfg);
    const res = await backend.chat({ system: 'you are concise', user: 'q?' });
    expect(res.text).toBe('Summary here.');
    expect(res.usage).toEqual({ promptTokens: 80, completionTokens: 20 });

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('https://api.anthropic.com/v1/messages');
    const headers = (init as RequestInit).headers as Record<string, string>;
    expect(headers['x-api-key']).toBe('sk-ant-test');
    expect(headers['anthropic-version']).toBe('2023-06-29');

    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.system).toBe('you are concise');
    expect(body.max_tokens).toBe(2048);
    expect(body.messages).toEqual([{ role: 'user', content: 'q?' }]);
  });

  it('error mapping: 401 → kind=auth', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('bad key', { status: 401 })),
    );
    const backend = createAnthropicBackend(cfg);
    await expect(backend.chat({ system: 's', user: 'q' })).rejects.toMatchObject({
      name: 'BackendError',
      kind: 'auth',
    });
  });

  it('times out when the worker never responds', async () => {
    vi.stubGlobal('fetch', abortableFetchMock());
    const backend = createAnthropicBackend({ ...cfg, requestTimeoutMs: 50 });
    await expect(backend.chat({ system: 's', user: 'q' })).rejects.toMatchObject({
      name: 'BackendError',
      kind: 'timeout',
    });
  });

  it('honors client-side AbortSignal', async () => {
    vi.stubGlobal('fetch', abortableFetchMock());
    const backend = createAnthropicBackend({ ...cfg, requestTimeoutMs: 60_000 });
    const ctrl = new AbortController();
    const p = backend.chat({ system: 's', user: 'q' }, ctrl.signal);
    setTimeout(() => ctrl.abort(), 5);
    await expect(p).rejects.toMatchObject({ name: 'BackendError', kind: 'timeout' });
  });
});

import type { Backend, ChatRequest, ChatResponse } from './types.js';
import { BackendError } from './types.js';
import { anySignal, makeMapHttpError, safeText } from './http-helpers.js';

interface OpenAIConfig {
  baseUrl: string;
  defaultModel: string;
  apiKey: string;
  requestTimeoutMs: number;
}

export function createOpenAIBackend(cfg: OpenAIConfig): Backend {
  const base = cfg.baseUrl.replace(/\/+$/, '');
  const mapHttpError = makeMapHttpError('OpenAI');

  async function chat(req: ChatRequest, signal?: AbortSignal): Promise<ChatResponse> {
    const model = req.model ?? cfg.defaultModel;
    const url = `${base}/v1/chat/completions`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), cfg.requestTimeoutMs);
    const combined = signal ? anySignal([signal, controller.signal]) : controller.signal;

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${cfg.apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: req.system },
            { role: 'user', content: req.user },
          ],
          max_tokens: req.maxTokens ?? 2048,
        }),
        signal: combined,
      });
      if (!res.ok) {
        throw mapHttpError(res.status, await safeText(res));
      }
      const json = (await res.json()) as {
        model?: string;
        choices?: Array<{ message?: { content?: string } }>;
        usage?: { prompt_tokens?: number; completion_tokens?: number };
      };
      const text = json.choices?.[0]?.message?.content ?? '';
      const usage =
        json.usage?.prompt_tokens !== undefined && json.usage.completion_tokens !== undefined
          ? { promptTokens: json.usage.prompt_tokens, completionTokens: json.usage.completion_tokens }
          : undefined;
      return {
        text,
        model: json.model ?? model,
        ...(usage ? { usage } : {}),
      };
    } catch (err) {
      if (err instanceof BackendError) throw err;
      if ((err as { name?: string }).name === 'AbortError') {
        throw new BackendError('timeout', `OpenAI request timed out after ${cfg.requestTimeoutMs}ms`);
      }
      throw new BackendError('http', `OpenAI request failed: ${(err as Error).message}`, undefined, err);
    } finally {
      clearTimeout(timeout);
    }
  }

  return { name: 'openai', chat };
}

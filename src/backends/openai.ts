import type { Backend, ChatRequest, ChatResponse } from './types.js';
import { BackendError } from './types.js';

interface OpenAIConfig {
  baseUrl: string;
  defaultModel: string;
  apiKey: string;
  requestTimeoutMs: number;
}

export function createOpenAIBackend(cfg: OpenAIConfig): Backend {
  const base = cfg.baseUrl.replace(/\/+$/, '');

  async function chat(req: ChatRequest, signal?: AbortSignal): Promise<ChatResponse> {
    const model = req.model ?? cfg.defaultModel;
    const url = `${base}/v1/chat/completions`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), cfg.requestTimeoutMs);
    const combined = signal
      ? anySignal([signal, controller.signal])
      : controller.signal;

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

function mapHttpError(status: number, body: string): BackendError {
  if (status === 401 || status === 403) return new BackendError('auth', `OpenAI auth failed (${status}): ${body}`, status);
  if (status === 429) return new BackendError('rate_limit', `OpenAI rate-limited (${status}): ${body}`, status);
  return new BackendError('http', `OpenAI HTTP ${status}: ${body}`, status);
}

async function safeText(res: Response): Promise<string> {
  try {
    return await res.text();
  } catch {
    return '<no body>';
  }
}

function anySignal(signals: AbortSignal[]): AbortSignal {
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

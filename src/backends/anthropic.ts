import type { Backend, ChatRequest, ChatResponse } from './types.js';
import { BackendError } from './types.js';

interface AnthropicConfig {
  baseUrl: string;
  defaultModel: string;
  apiKey: string;
  requestTimeoutMs: number;
}

/**
 * Anthropic Messages API.
 *
 * Compatible with any provider that exposes the same shape
 * (e.g. Anthropic-compatible proxies). Set SIDECAR_ANTHROPIC_URL
 * to override the default https://api.anthropic.com base.
 */
export function createAnthropicBackend(cfg: AnthropicConfig): Backend {
  const base = cfg.baseUrl.replace(/\/+$/, '');

  async function chat(req: ChatRequest, signal?: AbortSignal): Promise<ChatResponse> {
    const model = req.model ?? cfg.defaultModel;
    const url = `${base}/v1/messages`;
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
          'x-api-key': cfg.apiKey,
          'anthropic-version': '2023-06-29',
        },
        body: JSON.stringify({
          model,
          system: req.system,
          messages: [{ role: 'user', content: req.user }],
          max_tokens: req.maxTokens ?? 2048,
        }),
        signal: combined,
      });
      if (!res.ok) {
        throw mapHttpError(res.status, await safeText(res));
      }
      const json = (await res.json()) as {
        model?: string;
        content?: Array<{ type?: string; text?: string }>;
        usage?: { input_tokens?: number; output_tokens?: number };
      };
      const text =
        json.content?.find((c) => c.type === 'text')?.text ?? '';
      const usage =
        json.usage?.input_tokens !== undefined && json.usage.output_tokens !== undefined
          ? { promptTokens: json.usage.input_tokens, completionTokens: json.usage.output_tokens }
          : undefined;
      return {
        text,
        model: json.model ?? model,
        ...(usage ? { usage } : {}),
      };
    } catch (err) {
      if (err instanceof BackendError) throw err;
      if ((err as { name?: string }).name === 'AbortError') {
        throw new BackendError('timeout', `Anthropic request timed out after ${cfg.requestTimeoutMs}ms`);
      }
      throw new BackendError('http', `Anthropic request failed: ${(err as Error).message}`, undefined, err);
    } finally {
      clearTimeout(timeout);
    }
  }

  return { name: 'anthropic', chat };
}

function mapHttpError(status: number, body: string): BackendError {
  if (status === 401 || status === 403) return new BackendError('auth', `Anthropic auth failed (${status}): ${body}`, status);
  if (status === 429) return new BackendError('rate_limit', `Anthropic rate-limited (${status}): ${body}`, status);
  return new BackendError('http', `Anthropic HTTP ${status}: ${body}`, status);
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

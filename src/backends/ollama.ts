import type { Backend, ChatRequest, ChatResponse } from './types.js';
import { BackendError } from './types.js';
import { anySignal, makeMapHttpError, safeText } from './http-helpers.js';

interface OllamaConfig {
  baseUrl: string;
  defaultModel: string;
  requestTimeoutMs: number;
}

export function createOllamaBackend(cfg: OllamaConfig): Backend {
  const base = cfg.baseUrl.replace(/\/+$/, '');
  const mapHttpError = makeMapHttpError('Ollama');

  async function chat(req: ChatRequest, signal?: AbortSignal): Promise<ChatResponse> {
    const model = req.model ?? cfg.defaultModel;
    const url = `${base}/api/chat`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), cfg.requestTimeoutMs);
    const combined = signal ? anySignal([signal, controller.signal]) : controller.signal;

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: req.system },
            { role: 'user', content: req.user },
          ],
          stream: false,
          options: { num_predict: req.maxTokens ?? 2048 },
        }),
        signal: combined,
      });
      if (!res.ok) {
        throw mapHttpError(res.status, await safeText(res));
      }
      const json = (await res.json()) as {
        model?: string;
        message?: { content?: string };
        prompt_eval_count?: number;
        eval_count?: number;
      };
      const text = json.message?.content ?? '';
      const usage =
        json.prompt_eval_count !== undefined && json.eval_count !== undefined
          ? { promptTokens: json.prompt_eval_count, completionTokens: json.eval_count }
          : undefined;
      return {
        text,
        model: json.model ?? model,
        ...(usage ? { usage } : {}),
      };
    } catch (err) {
      if (err instanceof BackendError) throw err;
      if ((err as { name?: string }).name === 'AbortError') {
        throw new BackendError('timeout', `Ollama request timed out after ${cfg.requestTimeoutMs}ms`);
      }
      throw new BackendError('http', `Ollama request failed: ${(err as Error).message}`, undefined, err);
    } finally {
      clearTimeout(timeout);
    }
  }

  return { name: 'ollama', chat };
}

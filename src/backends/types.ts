/**
 * Backend abstraction for the worker LLM.
 *
 * All real adapters (ollama, openai, anthropic) implement this interface.
 * `fake` is an in-memory implementation used by tests and the demo.
 */

export type BackendName = 'ollama' | 'openai' | 'anthropic' | 'fake';

export interface ChatRequest {
  system: string;
  user: string;
  /** Override the configured default model for this single call. */
  model?: string;
  /** Default 2048. */
  maxTokens?: number;
}

export interface ChatResponse {
  text: string;
  /** The model that actually served the request (echoed from backend). */
  model: string;
  /** Optional; some backends don't report usage. */
  usage?: { promptTokens: number; completionTokens: number };
}

export interface Backend {
  readonly name: BackendName;
  chat(req: ChatRequest, signal?: AbortSignal): Promise<ChatResponse>;
}

export type BackendErrorKind = 'http' | 'parse' | 'auth' | 'rate_limit' | 'timeout';

export class BackendError extends Error {
  constructor(
    public readonly kind: BackendErrorKind,
    message: string,
    public readonly status?: number,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'BackendError';
  }
}

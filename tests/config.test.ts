import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config.js';

describe('loadConfig', () => {
  beforeEach(() => {
    for (const k of Object.keys(process.env)) {
      if (k.startsWith('SIDECAR_')) delete process.env[k];
    }
  });

  afterEach(() => {
    for (const k of Object.keys(process.env)) {
      if (k.startsWith('SIDECAR_')) delete process.env[k];
    }
  });

  it('applies defaults when SIDECAR_BACKEND is unset', () => {
    const cfg = loadConfig();
    expect(cfg.backend).toBe('ollama');
    expect(cfg.model).toBe('llama3.1:8b');
    expect(cfg.ollamaUrl).toBe('http://127.0.0.1:11434');
    expect(cfg.openaiUrl).toBe('https://api.openai.com');
    expect(cfg.anthropicUrl).toBe('https://api.anthropic.com');
    expect(cfg.fileMaxBytes).toBe(524288);
    expect(cfg.requestTimeoutMs).toBe(120000);
    expect(cfg.logLevel).toBe('info');
    expect(cfg.allowRoots).toEqual([process.cwd()]);
  });

  it('honors env overrides', () => {
    process.env.SIDECAR_BACKEND = 'openai';
    process.env.SIDECAR_OPENAI_KEY = 'sk-test';
    process.env.SIDECAR_MODEL = 'gpt-4o';
    process.env.SIDECAR_FILE_MAX_BYTES = '1024';
    process.env.SIDECAR_REQUEST_TIMEOUT_MS = '30000';
    const cfg = loadConfig();
    expect(cfg.backend).toBe('openai');
    expect(cfg.openaiKey).toBe('sk-test');
    expect(cfg.model).toBe('gpt-4o');
    expect(cfg.fileMaxBytes).toBe(1024);
    expect(cfg.requestTimeoutMs).toBe(30000);
  });

  it('raises when SIDECAR_BACKEND=openai but SIDECAR_OPENAI_KEY is missing', () => {
    process.env.SIDECAR_BACKEND = 'openai';
    expect(() => loadConfig()).toThrow(/SIDECAR_OPENAI_KEY is required/);
  });

  it('raises when SIDECAR_BACKEND=anthropic but SIDECAR_ANTHROPIC_KEY is missing', () => {
    process.env.SIDECAR_BACKEND = 'anthropic';
    expect(() => loadConfig()).toThrow(/SIDECAR_ANTHROPIC_KEY is required/);
  });

  it('parses comma-separated SIDECAR_ALLOW_ROOTS', () => {
    process.env.SIDECAR_ALLOW_ROOTS = '/a, /b ,/c';
    const cfg = loadConfig();
    expect(cfg.allowRoots).toEqual(['/a', '/b', '/c']);
  });

  it('produces an error for invalid SIDECAR_FILE_MAX_BYTES', () => {
    process.env.SIDECAR_FILE_MAX_BYTES = 'abc';
    expect(() => loadConfig()).toThrow(/fileMaxBytes/);
  });
});
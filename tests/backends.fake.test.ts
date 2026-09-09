import { describe, expect, it } from 'vitest';
import { createFakeBackend } from '../src/backends/fake.js';

describe('Fake backend', () => {
  it('records every chat request', async () => {
    const backend = createFakeBackend({ reply: 'r1' });
    await backend.chat({ system: 's', user: 'u1' });
    await backend.chat({ system: 's', user: 'u2', model: 'm2' });
    expect(backend.calls).toHaveLength(2);
    expect(backend.calls[0]!.user).toBe('u1');
    expect(backend.calls[1]!.user).toBe('u2');
    expect(backend.calls[1]!.model).toBe('m2');
  });

  it('setReply changes the canned response between calls', async () => {
    const backend = createFakeBackend({ reply: 'first' });
    const r1 = await backend.chat({ system: 's', user: 'u' });
    expect(r1.text).toBe('first');

    backend.setReply('second');
    const r2 = await backend.chat({ system: 's', user: 'u' });
    expect(r2.text).toBe('second');
  });

  it('uses the default reply when none is provided', async () => {
    const backend = createFakeBackend();
    const r = await backend.chat({ system: 's', user: 'u' });
    expect(r.text).toContain('fake worker response');
    expect(r.model).toBe('fake-model');
  });
});
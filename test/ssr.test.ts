// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';

vi.mock('../src/import-agent', () => ({ importAgent: vi.fn() }));

describe('server-side rendering and workers (no window, no document)', () => {
  it('imports without touching browser globals', async () => {
    expect(typeof window).toBe('undefined');
    const sdk = await import('../src/index');
    expect(typeof sdk.load).toBe('function');
    expect(sdk.VERSION).toBe('1.0.1');
  });

  it('load() rejects with unsupported_environment and imports nothing', async () => {
    const sdk = await import('../src/index');
    const { importAgent } = await import('../src/import-agent');
    const error = await sdk.load({ publicKey: '0123456789abcdef0123456789abcdef' }).catch((reason: unknown) => reason);
    expect(error).toBeInstanceOf(sdk.ShieldLabsError);
    expect(error).toMatchObject({ code: 'unsupported_environment' });
    expect(importAgent).not.toHaveBeenCalled();
  });

  it('still reports invalid options first', async () => {
    const sdk = await import('../src/index');
    await expect(sdk.load({ publicKey: 'not a key' })).rejects.toMatchObject({ code: 'invalid_options' });
  });
});

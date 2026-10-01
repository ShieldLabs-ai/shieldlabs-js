import { vi } from 'vitest';
import { createFakeAgent, type FakeAgent } from './fake-agent';

/** A fake 32-hex Public Key, the shape issued today. */
export const PUBLIC_KEY = '0123456789abcdef0123456789abcdef';

export const HTTPS_PAGE = 'https://shop.example.com/signup';

/** Point the happy-dom page at another URL (no navigation). */
export function setPageUrl(url: string): void {
  (window as unknown as { happyDOM: { setURL(url: string): void } }).happyDOM.setURL(url);
}

/**
 * Imports a fresh copy of the SDK (empty load cache, warnings not yet shown) whose importAgent is the
 * mock registered with vi.mock('../src/import-agent') in the calling test file.
 */
export async function freshSdk() {
  vi.resetModules();
  const sdk = await import('../../src/index');
  const { importAgent } = await import('../../src/import-agent');
  return { sdk, importAgent: vi.mocked(importAgent) };
}

/** A fresh SDK whose importAgent resolves to a new fake agent. */
export async function sdkWithFakeAgent(): Promise<{
  sdk: typeof import('../../src/index');
  importAgent: ReturnType<typeof vi.mocked<(url: string) => Promise<unknown>>>;
  fake: FakeAgent;
}> {
  const { sdk, importAgent } = await freshSdk();
  const fake = createFakeAgent();
  importAgent.mockResolvedValue(fake.module);
  return { sdk, importAgent, fake };
}

/** Lets pending microtasks (agent callbacks, promise reactions) run. */
export async function flushMicrotasks(): Promise<void> {
  for (let i = 0; i < 10; i += 1) await Promise.resolve();
}

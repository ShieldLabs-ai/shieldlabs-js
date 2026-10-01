import { afterEach, describe, expect, it, vi } from 'vitest';
import { createFakeAgent } from './support/fake-agent';
import { freshSdk, HTTPS_PAGE, PUBLIC_KEY, sdkWithFakeAgent, setPageUrl } from './support/sdk';

vi.mock('../src/import-agent', () => ({ importAgent: vi.fn() }));

const PROD = `https://cdn.shieldlabs.ai/snippet.js?publicKey=${PUBLIC_KEY}`;

afterEach(() => {
  setPageUrl(HTTPS_PAGE);
  vi.useRealTimers();
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe('load() options', () => {
  it('imports the production agent from the CDN by default', async () => {
    const { sdk, importAgent } = await sdkWithFakeAgent();
    const agent = await sdk.load({ publicKey: PUBLIC_KEY });
    expect(importAgent).toHaveBeenCalledTimes(1);
    expect(importAgent).toHaveBeenCalledWith(PROD);
    expect(typeof agent.identify).toBe('function');
    expect(typeof agent.check).toBe('function');
    expect(typeof agent.identifyOnInteraction).toBe('function');
  });

  it('imports the development agent for environment "development"', async () => {
    const { sdk, importAgent } = await sdkWithFakeAgent();
    await sdk.load({ publicKey: PUBLIC_KEY, environment: 'development' });
    expect(importAgent).toHaveBeenCalledWith(`https://dev.cdn.shieldlabs.ai/snippet.js?publicKey=${PUBLIC_KEY}`);
  });

  it('accepts environment "production" explicitly', async () => {
    const { sdk, importAgent } = await sdkWithFakeAgent();
    await sdk.load({ publicKey: PUBLIC_KEY, environment: 'production' });
    expect(importAgent).toHaveBeenCalledWith(PROD);
  });

  it.each([undefined, null, 'key', 42])('rejects %s as options with invalid_options', async (options) => {
    const { sdk, importAgent } = await sdkWithFakeAgent();
    await expect(sdk.load(options as never)).rejects.toMatchObject({ name: 'ShieldLabsError', code: 'invalid_options' });
    expect(importAgent).not.toHaveBeenCalled();
  });

  it.each([
    ['missing', undefined],
    ['empty', ''],
    ['with a space', 'abc def'],
    ['with a slash', 'abc/def'],
    ['with query characters', 'abc&x=1'],
    ['longer than 128 characters', 'a'.repeat(129)],
    ['not a string', 12345],
  ])('rejects a publicKey that is %s', async (_label, publicKey) => {
    const { sdk, importAgent } = await sdkWithFakeAgent();
    await expect(sdk.load({ publicKey } as never)).rejects.toMatchObject({ code: 'invalid_options' });
    expect(importAgent).not.toHaveBeenCalled();
  });

  it('accepts a legacy publicKey and warns once that it is not 32 lowercase hex', async () => {
    const { sdk, importAgent } = await sdkWithFakeAgent();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const legacy = '0f8fad5b-d9cb-469f-a165-70867728950e';
    await sdk.load({ publicKey: legacy });
    await sdk.load({ publicKey: legacy });
    await sdk.load({ publicKey: 'A'.repeat(128) });
    expect(importAgent).toHaveBeenCalledWith(`https://cdn.shieldlabs.ai/snippet.js?publicKey=${legacy}`);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0]?.[0])).toContain('publicKey');
  });

  it('does not warn for a 32 lowercase hex publicKey', async () => {
    const { sdk } = await sdkWithFakeAgent();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    await sdk.load({ publicKey: PUBLIC_KEY });
    expect(warn).not.toHaveBeenCalled();
  });

  it.each([
    ['a Private API Key', 'sec_a1b2c3d4-e5f6a7b8-c9d0e1f2'],
    ['a webhook signing secret', 'whsec_0123456789abcdef0123456789abcdef'],
  ])('rejects %s as publicKey without loading or echoing it', async (_label, secret) => {
    const { sdk, importAgent } = await sdkWithFakeAgent();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const error = await sdk.load({ publicKey: secret }).catch((reason: unknown) => reason);
    expect(error).toBeInstanceOf(sdk.ShieldLabsError);
    expect(error).toMatchObject({ code: 'invalid_options' });
    expect((error as Error).message).toContain('server-side secret');
    expect((error as Error).message).not.toContain(secret);
    expect(importAgent).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
  });

  it('accepts other keys that only contain "sec" further in', async () => {
    const { sdk, importAgent } = await sdkWithFakeAgent();
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    await sdk.load({ publicKey: 'section_7_key' });
    expect(importAgent).toHaveBeenCalledWith('https://cdn.shieldlabs.ai/snippet.js?publicKey=section_7_key');
  });

  it.each(['staging', '', 'PRODUCTION', 1])('rejects environment %s', async (environment) => {
    const { sdk } = await sdkWithFakeAgent();
    await expect(sdk.load({ publicKey: PUBLIC_KEY, environment } as never)).rejects.toMatchObject({
      code: 'invalid_options',
    });
  });

  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY, 2147483648, '1000'])('rejects timeout %s', async (timeout) => {
    const { sdk } = await sdkWithFakeAgent();
    await expect(sdk.load({ publicKey: PUBLIC_KEY, timeout } as never)).rejects.toMatchObject({
      code: 'invalid_options',
    });
  });
});

describe('load() scriptUrl', () => {
  it.each([
    ['https://agent.example.com/snippet.js', 'https://agent.example.com/snippet.js?publicKey=KEY'],
    ['https://agent.example.com/snippet.js?v=2', 'https://agent.example.com/snippet.js?v=2&publicKey=KEY'],
    ['https://agent.example.com/snippet.js?', 'https://agent.example.com/snippet.js?publicKey=KEY'],
    ['https://agent.example.com/snippet.js#top', 'https://agent.example.com/snippet.js?publicKey=KEY'],
    [
      'https://agent.example.com/snippet.js?publicKey=other&v=2',
      'https://agent.example.com/snippet.js?v=2&publicKey=KEY',
    ],
    ['http://localhost:8080/snippet.js', 'http://localhost:8080/snippet.js?publicKey=KEY'],
    ['http://127.0.0.1:5173/agent.js', 'http://127.0.0.1:5173/agent.js?publicKey=KEY'],
  ])('builds the agent URL from %s', async (scriptUrl, expected) => {
    const { sdk, importAgent } = await sdkWithFakeAgent();
    await sdk.load({ publicKey: PUBLIC_KEY, scriptUrl });
    expect(importAgent).toHaveBeenCalledWith(expected.replace('KEY', encodeURIComponent(PUBLIC_KEY)));
  });

  it('prefers scriptUrl over environment', async () => {
    const { sdk, importAgent } = await sdkWithFakeAgent();
    await sdk.load({ publicKey: PUBLIC_KEY, environment: 'development', scriptUrl: 'https://agent.example.com/a.js' });
    expect(importAgent).toHaveBeenCalledWith(`https://agent.example.com/a.js?publicKey=${PUBLIC_KEY}`);
  });

  it.each([
    'http://agent.example.com/snippet.js',
    'http://localhost.example.com/snippet.js',
    '//cdn.example.com/snippet.js',
    '/snippet.js',
    'snippet.js',
    'ftp://agent.example.com/snippet.js',
    'data:text/javascript,export default 1',
    'javascript:alert(1)',
    '',
    42,
  ])('rejects scriptUrl %s', async (scriptUrl) => {
    const { sdk, importAgent } = await sdkWithFakeAgent();
    await expect(sdk.load({ publicKey: PUBLIC_KEY, scriptUrl } as never)).rejects.toMatchObject({
      code: 'invalid_options',
    });
    expect(importAgent).not.toHaveBeenCalled();
  });
});

describe('load() environment checks', () => {
  it('rejects with unsupported_environment when document is missing', async () => {
    const { sdk, importAgent } = await sdkWithFakeAgent();
    vi.stubGlobal('document', undefined);
    await expect(sdk.load({ publicKey: PUBLIC_KEY })).rejects.toMatchObject({ code: 'unsupported_environment' });
    expect(importAgent).not.toHaveBeenCalled();
  });

  it('rejects with unsupported_environment on an http page', async () => {
    const { sdk, importAgent } = await sdkWithFakeAgent();
    setPageUrl('http://shop.example.com/signup');
    await expect(sdk.load({ publicKey: PUBLIC_KEY })).rejects.toMatchObject({ code: 'unsupported_environment' });
    expect(importAgent).not.toHaveBeenCalled();
  });

  it('rejects when the browser reports an insecure context, even on https', async () => {
    const { sdk } = await sdkWithFakeAgent();
    vi.stubGlobal('isSecureContext', false);
    await expect(sdk.load({ publicKey: PUBLIC_KEY })).rejects.toMatchObject({ code: 'unsupported_environment' });
  });

  it('trusts the browser when it reports a secure context', async () => {
    const { sdk, importAgent } = await sdkWithFakeAgent();
    setPageUrl('http://shop.example.com/signup');
    vi.stubGlobal('isSecureContext', true);
    await sdk.load({ publicKey: PUBLIC_KEY });
    expect(importAgent).toHaveBeenCalledTimes(1);
  });

  it.each(['http://localhost:5173/', 'http://127.0.0.1:8080/form'])('allows %s over plain http', async (url) => {
    const { sdk, importAgent } = await sdkWithFakeAgent();
    setPageUrl(url);
    vi.stubGlobal('isSecureContext', false);
    await sdk.load({ publicKey: PUBLIC_KEY });
    expect(importAgent).toHaveBeenCalledTimes(1);
  });

  it('validates options before the environment', async () => {
    const { sdk } = await sdkWithFakeAgent();
    vi.stubGlobal('document', undefined);
    await expect(sdk.load({ publicKey: '' })).rejects.toMatchObject({ code: 'invalid_options' });
  });
});

describe('load() memoization', () => {
  it('shares one import between concurrent calls', async () => {
    const { sdk, importAgent } = await freshSdk();
    const fake = createFakeAgent();
    const pending = deferred<unknown>();
    importAgent.mockReturnValue(pending.promise);
    const first = sdk.load({ publicKey: PUBLIC_KEY });
    const second = sdk.load({ publicKey: PUBLIC_KEY });
    pending.resolve(fake.module);
    const [a, b] = await Promise.all([first, second]);
    expect(importAgent).toHaveBeenCalledTimes(1);
    await expect(a.identify()).resolves.toMatchObject({ userId: null });
    await expect(b.identify()).resolves.toMatchObject({ userId: null });
  });

  it('reuses the loaded agent module for later calls', async () => {
    const { sdk, importAgent } = await sdkWithFakeAgent();
    await sdk.load({ publicKey: PUBLIC_KEY });
    await sdk.load({ publicKey: PUBLIC_KEY, timeout: 2000 });
    expect(importAgent).toHaveBeenCalledTimes(1);
  });

  it('imports again for another public key or another agent URL', async () => {
    const { sdk, importAgent } = await sdkWithFakeAgent();
    await sdk.load({ publicKey: PUBLIC_KEY });
    await sdk.load({ publicKey: 'fedcba9876543210fedcba9876543210' });
    await sdk.load({ publicKey: PUBLIC_KEY, environment: 'development' });
    expect(importAgent).toHaveBeenCalledTimes(3);
  });

  it('does not cache a failed import: the next call retries', async () => {
    const { sdk, importAgent } = await freshSdk();
    const fake = createFakeAgent();
    const networkError = new TypeError('Failed to fetch dynamically imported module');
    importAgent.mockRejectedValueOnce(networkError).mockResolvedValueOnce(fake.module);

    const failure = await sdk.load({ publicKey: PUBLIC_KEY }).catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(sdk.ShieldLabsError);
    expect(failure).toMatchObject({ code: 'load_failed', cause: networkError });

    const agent = await sdk.load({ publicKey: PUBLIC_KEY });
    expect(importAgent).toHaveBeenCalledTimes(2);
    await expect(agent.identify()).resolves.toHaveProperty('requestId');
  });

  it('retries with a new URL each time, because browsers remember a failed module load per URL', async () => {
    const { sdk, importAgent } = await freshSdk();
    importAgent
      .mockRejectedValueOnce(new TypeError('Failed to fetch dynamically imported module'))
      .mockRejectedValueOnce(new TypeError('Failed to fetch dynamically imported module'))
      .mockResolvedValueOnce(createFakeAgent().module);

    await expect(sdk.load({ publicKey: PUBLIC_KEY })).rejects.toMatchObject({ code: 'load_failed' });
    const second = await sdk.load({ publicKey: PUBLIC_KEY }).catch((error: unknown) => error);
    expect(second).toMatchObject({ code: 'load_failed' });
    expect((second as Error).message).toContain(`${PROD}&retry=1`);
    const agent = await sdk.load({ publicKey: PUBLIC_KEY });
    await sdk.load({ publicKey: PUBLIC_KEY });

    expect(importAgent.mock.calls.map(([url]) => url)).toEqual([PROD, `${PROD}&retry=1`, `${PROD}&retry=2`]);
    await expect(agent.identify()).resolves.toHaveProperty('requestId');
  });

  it('counts failures per agent URL', async () => {
    const { sdk, importAgent } = await freshSdk();
    importAgent.mockRejectedValueOnce(new Error('offline')).mockResolvedValue(createFakeAgent().module);
    await expect(sdk.load({ publicKey: PUBLIC_KEY })).rejects.toMatchObject({ code: 'load_failed' });
    await sdk.load({ publicKey: PUBLIC_KEY, environment: 'development' });
    await sdk.load({ publicKey: PUBLIC_KEY });
    expect(importAgent.mock.calls.map(([url]) => url)).toEqual([
      PROD,
      `https://dev.cdn.shieldlabs.ai/snippet.js?publicKey=${PUBLIC_KEY}`,
      `${PROD}&retry=1`,
    ]);
  });

  it('adds the retry parameter after the query of a scriptUrl', async () => {
    const { sdk, importAgent } = await freshSdk();
    importAgent.mockRejectedValueOnce(new Error('offline')).mockResolvedValue(createFakeAgent().module);
    const scriptUrl = 'https://agent.example.com/snippet.js?v=2';
    await expect(sdk.load({ publicKey: PUBLIC_KEY, scriptUrl })).rejects.toMatchObject({ code: 'load_failed' });
    await sdk.load({ publicKey: PUBLIC_KEY, scriptUrl });
    expect(importAgent).toHaveBeenLastCalledWith(`https://agent.example.com/snippet.js?v=2&publicKey=${PUBLIC_KEY}&retry=1`);
  });

  it('rejects all concurrent callers of a failed import, then retries', async () => {
    const { sdk, importAgent } = await freshSdk();
    const pending = deferred<unknown>();
    importAgent.mockReturnValueOnce(pending.promise);
    const first = sdk.load({ publicKey: PUBLIC_KEY });
    const second = sdk.load({ publicKey: PUBLIC_KEY });
    pending.reject(new Error('blocked'));
    await expect(first).rejects.toMatchObject({ code: 'load_failed' });
    await expect(second).rejects.toMatchObject({ code: 'load_failed' });
    importAgent.mockResolvedValueOnce(createFakeAgent().module);
    await expect(sdk.load({ publicKey: PUBLIC_KEY })).resolves.toBeDefined();
    expect(importAgent).toHaveBeenCalledTimes(2);
    expect(importAgent).toHaveBeenLastCalledWith(`${PROD}&retry=1`);
  });

  it('can retry from inside the rejection handler of a failed call', async () => {
    const { sdk, importAgent } = await freshSdk();
    importAgent.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(createFakeAgent().module);
    const agent = await sdk.load({ publicKey: PUBLIC_KEY }).catch(() => sdk.load({ publicKey: PUBLIC_KEY }));
    expect(typeof agent.identify).toBe('function');
    expect(importAgent).toHaveBeenLastCalledWith(`${PROD}&retry=1`);
  });

  it('wraps a synchronous import failure in load_failed', async () => {
    const { sdk, importAgent } = await freshSdk();
    importAgent.mockImplementationOnce(() => {
      throw new Error('boom');
    });
    await expect(sdk.load({ publicKey: PUBLIC_KEY })).rejects.toMatchObject({ code: 'load_failed' });
  });

  it.each([
    ['an empty module', {}],
    ['a module without force exports', { checkAnonymous: () => undefined, checkAuthenticatedUser: () => undefined }],
    ['a non-object', 'text'],
    ['null', null],
  ])('rejects %s with load_failed and retries later', async (_label, mod) => {
    const { sdk, importAgent } = await freshSdk();
    importAgent.mockResolvedValueOnce(mod).mockResolvedValueOnce(createFakeAgent().module);
    await expect(sdk.load({ publicKey: PUBLIC_KEY })).rejects.toMatchObject({ code: 'load_failed' });
    await expect(sdk.load({ publicKey: PUBLIC_KEY })).resolves.toBeDefined();
    expect(importAgent).toHaveBeenCalledTimes(2);
    expect(importAgent).toHaveBeenLastCalledWith(`${PROD}&retry=1`);
  });
});

describe('load() timeout', () => {
  it('rejects with timeout when the agent does not load in time, and leaves no timer behind', async () => {
    vi.useFakeTimers();
    const { sdk, importAgent } = await freshSdk();
    importAgent.mockReturnValueOnce(deferred<unknown>().promise);
    const result = sdk.load({ publicKey: PUBLIC_KEY, timeout: 1000 });
    const assertion = expect(result).rejects.toMatchObject({ name: 'ShieldLabsError', code: 'timeout' });
    await vi.advanceTimersByTimeAsync(1000);
    await assertion;
    expect(vi.getTimerCount()).toBe(0);
  });

  it('uses 10 seconds by default', async () => {
    vi.useFakeTimers();
    const { sdk, importAgent } = await freshSdk();
    importAgent.mockReturnValueOnce(deferred<unknown>().promise);
    let settled = false;
    const result = sdk.load({ publicKey: PUBLIC_KEY }).finally(() => {
      settled = true;
    });
    const assertion = expect(result).rejects.toMatchObject({ code: 'timeout' });
    await vi.advanceTimersByTimeAsync(9999);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await assertion;
  });

  it('keeps the import running after a timeout: a later call uses it without importing again', async () => {
    vi.useFakeTimers();
    const { sdk, importAgent } = await freshSdk();
    const pending = deferred<unknown>();
    importAgent.mockReturnValueOnce(pending.promise);

    const first = sdk.load({ publicKey: PUBLIC_KEY, timeout: 1000 });
    const assertion = expect(first).rejects.toMatchObject({ code: 'timeout' });
    await vi.advanceTimersByTimeAsync(1000);
    await assertion;

    // Called while the slow import is still running: it waits for the same import.
    const second = sdk.load({ publicKey: PUBLIC_KEY, timeout: 1000 });
    pending.resolve(createFakeAgent().module);
    const agent = await second;
    await sdk.load({ publicKey: PUBLIC_KEY });

    expect(importAgent).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
    const identified = agent.identify();
    await vi.advanceTimersByTimeAsync(0);
    await expect(identified).resolves.toHaveProperty('requestId');
  });

  it('retries with a new URL when the import that timed out fails later', async () => {
    vi.useFakeTimers();
    const { sdk, importAgent } = await freshSdk();
    const pending = deferred<unknown>();
    importAgent.mockReturnValueOnce(pending.promise).mockResolvedValueOnce(createFakeAgent().module);

    const first = sdk.load({ publicKey: PUBLIC_KEY, timeout: 1000 });
    const assertion = expect(first).rejects.toMatchObject({ code: 'timeout' });
    await vi.advanceTimersByTimeAsync(1000);
    await assertion;
    pending.reject(new TypeError('Failed to fetch dynamically imported module'));
    await vi.advanceTimersByTimeAsync(0);

    await expect(sdk.load({ publicKey: PUBLIC_KEY })).resolves.toBeDefined();
    expect(importAgent.mock.calls.map(([url]) => url)).toEqual([PROD, `${PROD}&retry=1`]);
  });

  it('clears the timer when the import fails', async () => {
    vi.useFakeTimers();
    const { sdk, importAgent } = await freshSdk();
    importAgent.mockRejectedValueOnce(new Error('blocked'));
    await expect(sdk.load({ publicKey: PUBLIC_KEY })).rejects.toMatchObject({ code: 'load_failed' });
    expect(vi.getTimerCount()).toBe(0);
  });

  it('clears the timer when the agent is already loaded', async () => {
    vi.useFakeTimers();
    const { sdk } = await sdkWithFakeAgent();
    await sdk.load({ publicKey: PUBLIC_KEY });
    await sdk.load({ publicKey: PUBLIC_KEY });
    expect(vi.getTimerCount()).toBe(0);
  });
});

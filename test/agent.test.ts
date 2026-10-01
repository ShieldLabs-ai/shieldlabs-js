import { afterEach, describe, expect, it, vi } from 'vitest';
import { flushMicrotasks, PUBLIC_KEY, sdkWithFakeAgent } from './support/sdk';

vi.mock('../src/import-agent', () => ({ importAgent: vi.fn() }));

const USER_HID = '9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

afterEach(() => {
  vi.useRealTimers();
});

async function loaded(timeout?: number) {
  const setup = await sdkWithFakeAgent();
  const agent = await setup.sdk.load(timeout === undefined ? { publicKey: PUBLIC_KEY } : { publicKey: PUBLIC_KEY, timeout });
  return { ...setup, agent };
}

function onInitializedOf(options: unknown): unknown {
  return (options as { onInitialized?: unknown } | undefined)?.onInitialized;
}

describe('identify()', () => {
  it('calls forceCheckAnonymous with an options object and resolves the request ID', async () => {
    const { agent, fake } = await loaded();
    const result = await agent.identify();
    expect(result.requestId).toMatch(UUID);
    expect(result.userId).toBeNull();
    expect(fake.calls).toHaveLength(1);
    const call = fake.calls[0]!;
    expect(call.name).toBe('forceCheckAnonymous');
    expect(call.args).toHaveLength(1);
    expect(typeof call.args[0]).toBe('object');
    expect(typeof onInitializedOf(call.args[0])).toBe('function');
  });

  it('calls forceCheckAuthenticatedUser with the User HID and an options object', async () => {
    const { agent, fake } = await loaded();
    const result = await agent.identify({ userId: USER_HID });
    expect(result).toEqual({ requestId: expect.stringMatching(UUID) as unknown, userId: USER_HID });
    const call = fake.calls[0]!;
    expect(call.name).toBe('forceCheckAuthenticatedUser');
    expect(call.args[0]).toBe(USER_HID);
    expect(typeof onInitializedOf(call.args[1])).toBe('function');
  });

  it('returns a new request ID on every call (no caching)', async () => {
    const { agent, fake } = await loaded();
    const first = await agent.identify();
    const second = await agent.identify();
    expect(first.requestId).not.toBe(second.requestId);
    expect(fake.calls.map((call) => call.name)).toEqual(['forceCheckAnonymous', 'forceCheckAnonymous']);
  });

  it('treats userId null like an omitted userId', async () => {
    const { agent, fake } = await loaded();
    await expect(agent.identify({ userId: null } as never)).resolves.toMatchObject({ userId: null });
    expect(fake.calls[0]!.name).toBe('forceCheckAnonymous');
  });

  it('rejects with not_initialized when the agent answers not_initialized', async () => {
    const { agent, fake, sdk } = await loaded();
    fake.answer('not_initialized');
    const error = await agent.identify().catch((reason: unknown) => reason);
    expect(error).toBeInstanceOf(sdk.ShieldLabsError);
    expect(error).toMatchObject({ code: 'not_initialized' });
  });

  it('rejects with not_initialized when the agent throws', async () => {
    const { agent, fake } = await loaded();
    fake.answer('throw');
    await expect(agent.identify()).rejects.toMatchObject({ code: 'not_initialized', cause: expect.any(Error) as unknown });
  });

  it.each([
    ['an initialized answer without a request ID', { status: 'initialized' }],
    ['an empty request ID', { status: 'initialized', requestID: '' }],
    ['a non-string request ID', { status: 'initialized', requestID: 42 }],
    ['an unknown status', { status: 'queued', requestID: 'b6f1c7a2-7d7e-4f55-9a61-0f1f1b0e2a11' }],
    ['a non-object answer', 'initialized'],
  ])('rejects %s with not_initialized', async (_label, answer) => {
    const { sdk, importAgent } = await sdkWithFakeAgent();
    const module = {
      checkAnonymous: vi.fn(),
      checkAuthenticatedUser: vi.fn(),
      forceCheckAuthenticatedUser: vi.fn(),
      forceCheckAnonymous: vi.fn((options: { onInitialized(a: unknown): void }) => {
        queueMicrotask(() => {
          options.onInitialized(answer);
        });
      }),
    };
    importAgent.mockResolvedValue(module);
    const agent = await sdk.load({ publicKey: PUBLIC_KEY });
    await expect(agent.identify()).rejects.toMatchObject({ code: 'not_initialized' });
  });

  it('settles once when a faulty agent calls back twice', async () => {
    const { sdk, importAgent } = await sdkWithFakeAgent();
    const module = {
      checkAnonymous: vi.fn(),
      checkAuthenticatedUser: vi.fn(),
      forceCheckAuthenticatedUser: vi.fn(),
      forceCheckAnonymous: vi.fn((options: { onInitialized(a: unknown): void }) => {
        options.onInitialized({ status: 'initialized', requestID: 'b6f1c7a2-7d7e-4f55-9a61-0f1f1b0e2a11' });
        options.onInitialized({ status: 'not_initialized' });
      }),
    };
    importAgent.mockResolvedValue(module);
    const agent = await sdk.load({ publicKey: PUBLIC_KEY });
    await expect(agent.identify()).resolves.toEqual({
      requestId: 'b6f1c7a2-7d7e-4f55-9a61-0f1f1b0e2a11',
      userId: null,
    });
  });
});

describe('check()', () => {
  it('calls checkAnonymous with an options object and resolves the request ID', async () => {
    const { agent, fake } = await loaded();
    const result = await agent.check();
    expect(result).toEqual({ requestId: expect.stringMatching(UUID) as unknown, userId: null });
    expect(fake.calls[0]!.name).toBe('checkAnonymous');
    expect(typeof onInitializedOf(fake.calls[0]!.args[0])).toBe('function');
  });

  it('calls checkAuthenticatedUser with the User HID', async () => {
    const { agent, fake } = await loaded();
    await expect(agent.check({ userId: USER_HID })).resolves.toMatchObject({ userId: USER_HID });
    expect(fake.calls[0]!.name).toBe('checkAuthenticatedUser');
    expect(fake.calls[0]!.args[0]).toBe(USER_HID);
  });

  it('resolves null when the agent skips the check inside the five-minute window', async () => {
    const { agent } = await loaded();
    await expect(agent.check()).resolves.not.toBeNull();
    await expect(agent.check()).resolves.toBeNull();
  });

  it('resolves null for any not_initialized answer', async () => {
    const { agent, fake } = await loaded();
    fake.answer('not_initialized');
    await expect(agent.check()).resolves.toBeNull();
  });

  it('still rejects invalid options', async () => {
    const { agent, fake } = await loaded();
    await expect(agent.check({ userId: '' })).rejects.toMatchObject({ code: 'invalid_options' });
    expect(fake.calls).toHaveLength(0);
  });

  it('rejects with timeout when the agent never answers', async () => {
    vi.useFakeTimers();
    const { agent, fake } = await loaded(1000);
    fake.answer('silent');
    const result = agent.check();
    const assertion = expect(result).rejects.toMatchObject({ code: 'timeout' });
    await vi.advanceTimersByTimeAsync(1000);
    await assertion;
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe('timeouts', () => {
  it('uses 10 seconds by default', async () => {
    vi.useFakeTimers();
    const { agent, fake } = await loaded();
    fake.answer('silent');
    let settled = false;
    const result = agent.identify().finally(() => {
      settled = true;
    });
    const assertion = expect(result).rejects.toMatchObject({ code: 'timeout' });
    await vi.advanceTimersByTimeAsync(9999);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await assertion;
    expect(vi.getTimerCount()).toBe(0);
  });

  it('uses LoadOptions.timeout as the default per call', async () => {
    vi.useFakeTimers();
    const { agent, fake } = await loaded(250);
    fake.answer('silent');
    const assertion = expect(agent.identify()).rejects.toMatchObject({ code: 'timeout' });
    await vi.advanceTimersByTimeAsync(250);
    await assertion;
  });

  it('lets IdentifyOptions.timeout override the default', async () => {
    vi.useFakeTimers();
    const { agent, fake } = await loaded(5000);
    fake.answer('silent');
    const assertion = expect(agent.identify({ timeout: 100 })).rejects.toMatchObject({ code: 'timeout' });
    await vi.advanceTimersByTimeAsync(100);
    await assertion;
  });

  it('ignores a callback that arrives after the timeout and leaves no timers behind', async () => {
    vi.useFakeTimers();
    const { agent, fake } = await loaded(500);
    fake.answer('silent');
    const unhandled = vi.fn();
    process.on('unhandledRejection', unhandled);
    try {
      const assertion = expect(agent.identify()).rejects.toMatchObject({ code: 'timeout' });
      await vi.advanceTimersByTimeAsync(500);
      await assertion;
      expect(vi.getTimerCount()).toBe(0);

      fake.releaseHeld();
      await flushMicrotasks();
      expect(vi.getTimerCount()).toBe(0);
      expect(unhandled).not.toHaveBeenCalled();
    } finally {
      process.off('unhandledRejection', unhandled);
    }
  });

  it('clears the timer as soon as the agent answers', async () => {
    vi.useFakeTimers();
    const { agent } = await loaded();
    const result = agent.identify();
    await flushMicrotasks();
    await expect(result).resolves.toHaveProperty('requestId');
    expect(vi.getTimerCount()).toBe(0);
  });

  it('clears the timer when the agent answers not_initialized', async () => {
    vi.useFakeTimers();
    const { agent, fake } = await loaded();
    fake.answer('not_initialized');
    const assertion = expect(agent.identify()).rejects.toMatchObject({ code: 'not_initialized' });
    await flushMicrotasks();
    await assertion;
    expect(vi.getTimerCount()).toBe(0);
  });

  it('clears the timer when the agent throws', async () => {
    vi.useFakeTimers();
    const { agent, fake } = await loaded();
    fake.answer('throw');
    await expect(agent.identify()).rejects.toMatchObject({ code: 'not_initialized' });
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each([0, -5, Number.NaN, Number.POSITIVE_INFINITY, '100'])('rejects IdentifyOptions.timeout %s', async (timeout) => {
    const { agent, fake } = await loaded();
    await expect(agent.identify({ timeout } as never)).rejects.toMatchObject({ code: 'invalid_options' });
    expect(fake.calls).toHaveLength(0);
  });
});

describe('userId rules', () => {
  it.each([
    ['an empty string', ''],
    ['whitespace only', '   '],
    ['"anonymous"', 'anonymous'],
    ['"fail"', 'fail'],
    ['"-1"', '-1'],
    ['"unknown"', 'unknown'],
    ['a number', 42],
    ['an object', { id: 1 }],
  ])('rejects %s with invalid_options before calling the agent', async (_label, userId) => {
    const { agent, fake } = await loaded();
    await expect(agent.identify({ userId } as never)).rejects.toMatchObject({ code: 'invalid_options' });
    expect(fake.calls).toHaveLength(0);
  });

  it('rejects options that are not an object', async () => {
    const { agent } = await loaded();
    await expect(agent.identify('user-1' as never)).rejects.toMatchObject({ code: 'invalid_options' });
  });

  it('accepts reserved words in another case or inside a longer value', async () => {
    const { agent } = await loaded();
    await expect(agent.identify({ userId: 'Anonymous' })).resolves.toMatchObject({ userId: 'Anonymous' });
    await expect(agent.identify({ userId: 'unknown-user-7' })).resolves.toMatchObject({ userId: 'unknown-user-7' });
  });

  it.each(['team/42', 'a?b', 'a#b', '100%'])('warns once when userId contains a character like in %s', async (userId) => {
    const { agent } = await loaded();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    await agent.identify({ userId });
    await agent.identify({ userId: userId + '-again' });
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0]?.[0])).toContain('History API');
  });

  it.each(['.', '..'])('warns once for the userId "%s" and still runs the call', async (userId) => {
    const { agent, fake } = await loaded();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    await expect(agent.identify({ userId })).resolves.toMatchObject({ userId });
    await agent.identify({ userId });
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0]?.[0])).toContain('History API');
    expect(fake.calls.map((call) => call.args[0])).toEqual([userId, userId]);
  });

  it.each(['...', '.hidden', 'a.b', 'v1.2.3'])('does not warn for the userId %s', async (userId) => {
    const { agent } = await loaded();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    await agent.identify({ userId });
    expect(warn).not.toHaveBeenCalled();
  });

  it('warns once when userId looks like an email address, and still runs the call', async () => {
    const { agent, fake } = await loaded();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    await expect(agent.identify({ userId: 'jane@example.com' })).resolves.toMatchObject({ userId: 'jane@example.com' });
    await agent.check({ userId: 'john.doe@example.org' });
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0]?.[0])).toContain('email');
    expect(fake.calls).toHaveLength(2);
  });

  it('does not warn for a hex User HID', async () => {
    const { agent } = await loaded();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    await agent.identify({ userId: USER_HID });
    expect(warn).not.toHaveBeenCalled();
  });
});

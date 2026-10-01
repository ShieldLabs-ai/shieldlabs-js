import { afterEach, describe, expect, it, vi } from 'vitest';
import { flushMicrotasks, PUBLIC_KEY, sdkWithFakeAgent } from './support/sdk';

vi.mock('../src/import-agent', () => ({ importAgent: vi.fn() }));

const USER_HID = '5e884898da28047151d0e56f8dc6292773603d0d6aabbdd62a11ef721d1542d8';

afterEach(() => {
  document.body.replaceChildren();
  vi.useRealTimers();
});

function signupForm() {
  const form = document.createElement('form');
  const input = document.createElement('input');
  input.name = 'email';
  const button = document.createElement('button');
  button.type = 'submit';
  button.textContent = 'Sign up';
  form.append(input, button);
  document.body.append(form);
  return { form, input };
}

async function setup() {
  const context = await sdkWithFakeAgent();
  const agent = await context.sdk.load({ publicKey: PUBLIC_KEY });
  return { ...context, agent, ...signupForm() };
}

describe('identifyOnInteraction()', () => {
  it('does nothing before the first interaction', async () => {
    const { agent, fake, form } = await setup();
    agent.identifyOnInteraction(form);
    await flushMicrotasks();
    expect(fake.calls).toHaveLength(0);
  });

  it.each([
    ['focusin', () => new FocusEvent('focusin', { bubbles: true })],
    ['pointerdown', () => new PointerEvent('pointerdown', { bubbles: true })],
    ['keydown', () => new KeyboardEvent('keydown', { bubbles: true, key: 'a' })],
  ])('starts identify() on the first %s inside the target', async (_type, createEvent) => {
    const { agent, fake, form, input } = await setup();
    const handle = agent.identifyOnInteraction(form);
    input.dispatchEvent(createEvent());
    expect(fake.calls).toHaveLength(1);
    expect(fake.calls[0]!.name).toBe('forceCheckAnonymous');
    const result = await handle.take();
    expect(result.requestId).toMatch(/^[0-9a-f-]{36}$/);
    expect(fake.calls).toHaveLength(1);
    handle.dispose();
  });

  it('starts only one identification for many interactions', async () => {
    const { agent, fake, form, input } = await setup();
    const handle = agent.identifyOnInteraction(form);
    input.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
    input.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'j' }));
    input.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'a' }));
    form.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    await flushMicrotasks();
    expect(fake.calls).toHaveLength(1);
    await handle.take();
    expect(fake.calls).toHaveLength(1);
  });

  it('take() starts identify() when no interaction happened yet', async () => {
    const { agent, fake, form } = await setup();
    const handle = agent.identifyOnInteraction(form);
    await expect(handle.take()).resolves.toMatchObject({ userId: null });
    expect(fake.calls).toHaveLength(1);
  });

  it('take() returns the early result, then re-arms for the next submission', async () => {
    const { agent, fake, form, input } = await setup();
    const handle = agent.identifyOnInteraction(form);

    input.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
    const first = await handle.take();

    input.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'x' }));
    expect(fake.calls).toHaveLength(2);
    const second = await handle.take();

    expect(second.requestId).not.toBe(first.requestId);
    const third = await handle.take();
    expect(third.requestId).not.toBe(second.requestId);
    expect(fake.calls).toHaveLength(3);
  });

  it('hands out a still-running identification and re-arms immediately', async () => {
    const { agent, fake, form, input } = await setup();
    const handle = agent.identifyOnInteraction(form);
    input.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
    const pending = handle.take();
    input.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'x' }));
    expect(fake.calls).toHaveLength(2);
    const [first, second] = await Promise.all([pending, handle.take()]);
    expect(first.requestId).not.toBe(second.requestId);
  });

  it('passes the User HID and timeout to identify()', async () => {
    vi.useFakeTimers();
    const { agent, fake, form, input } = await setup();
    const handle = agent.identifyOnInteraction(form, { userId: USER_HID, timeout: 300 });
    input.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
    expect(fake.calls[0]!.name).toBe('forceCheckAuthenticatedUser');
    expect(fake.calls[0]!.args[0]).toBe(USER_HID);
    await expect(handle.take()).resolves.toMatchObject({ userId: USER_HID });

    fake.answer('silent');
    input.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
    const assertion = expect(handle.take()).rejects.toMatchObject({ code: 'timeout' });
    await vi.advanceTimersByTimeAsync(300);
    await assertion;
    expect(vi.getTimerCount()).toBe(0);
  });

  it('starts a new identification in take() when the early one failed', async () => {
    const { agent, fake, form, input } = await setup();
    const handle = agent.identifyOnInteraction(form);
    fake.answer('not_initialized');
    input.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
    await flushMicrotasks();
    await expect(handle.take()).resolves.toHaveProperty('requestId');
    expect(fake.calls).toHaveLength(2);
  });

  it('take() returns an early identification that finished less than four minutes ago', async () => {
    vi.useFakeTimers();
    const { agent, fake, form, input } = await setup();
    const handle = agent.identifyOnInteraction(form);
    input.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(4 * 60 * 1000 - 1);
    const taken = handle.take();
    await vi.advanceTimersByTimeAsync(0);
    await expect(taken).resolves.toMatchObject({ requestId: fake.answers[0]!.requestID });
    expect(fake.calls).toHaveLength(1);
  });

  it('take() replaces an early identification older than four minutes (5-minute freshness window)', async () => {
    vi.useFakeTimers();
    const { agent, fake, form, input } = await setup();
    const handle = agent.identifyOnInteraction(form);
    input.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
    await vi.advanceTimersByTimeAsync(0);
    expect(fake.calls).toHaveLength(1);

    await vi.advanceTimersByTimeAsync(4 * 60 * 1000);
    const taken = handle.take();
    expect(fake.calls).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(0);
    const result = await taken;

    // The fresh identification is the one handed out, not the stale early one.
    expect(fake.answers).toHaveLength(2);
    expect(result.requestId).toBe(fake.answers[1]!.requestID);
    expect(result.requestId).not.toBe(fake.answers[0]!.requestID);
  });

  it('the next interaction replaces a stale early identification', async () => {
    vi.useFakeTimers();
    const { agent, fake, form, input } = await setup();
    const handle = agent.identifyOnInteraction(form);
    input.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
    await vi.advanceTimersByTimeAsync(4 * 60 * 1000);
    input.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'a' }));
    expect(fake.calls).toHaveLength(2);
    const taken = handle.take();
    await vi.advanceTimersByTimeAsync(0);
    await expect(taken).resolves.toHaveProperty('requestId');
    expect(fake.calls).toHaveLength(2);
  });

  it('keeps interacting users at most one identification every four minutes without a submit', async () => {
    vi.useFakeTimers();
    const { agent, fake, form, input } = await setup();
    const handle = agent.identifyOnInteraction(form);
    // One key press every 10 seconds for 30 minutes, and never a take().
    for (let second = 0; second < 30 * 60; second += 10) {
      input.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'a' }));
      await vi.advanceTimersByTimeAsync(10 * 1000);
    }
    // Minutes 0, 4, 8, 12, 16, 20, 24 and 28.
    expect(fake.calls).toHaveLength(8);
    handle.dispose();
  });

  it('retries on a later interaction after the early identification failed, at most every 5 seconds', async () => {
    vi.useFakeTimers();
    const { agent, fake, form, input } = await setup();
    const handle = agent.identifyOnInteraction(form);
    fake.answer('not_initialized', 'not_initialized');
    input.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
    await vi.advanceTimersByTimeAsync(0);

    // Typing right after the failure does not call the agent on every key press.
    for (const key of ['j', 'a', 'n', 'e']) input.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key }));
    expect(fake.calls).toHaveLength(1);

    await vi.advanceTimersByTimeAsync(5000);
    input.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: '@' }));
    expect(fake.calls).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(0);

    // The second attempt failed too: again no call before 5 seconds have passed.
    input.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'x' }));
    expect(fake.calls).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(5000);
    form.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    expect(fake.calls).toHaveLength(3);

    const taken = handle.take();
    await vi.advanceTimersByTimeAsync(0);
    await expect(taken).resolves.toHaveProperty('requestId');
    expect(fake.calls).toHaveLength(3);
  });

  it('retries on a later interaction after the early identification timed out', async () => {
    vi.useFakeTimers();
    const { agent, fake, form, input } = await setup();
    const handle = agent.identifyOnInteraction(form, { timeout: 1000 });
    fake.answer('silent');
    input.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
    await vi.advanceTimersByTimeAsync(1000);
    input.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'a' }));
    expect(fake.calls).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(5000);
    input.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'b' }));
    expect(fake.calls).toHaveLength(2);
    const taken = handle.take();
    await vi.advanceTimersByTimeAsync(0);
    await expect(taken).resolves.toHaveProperty('requestId');
    expect(vi.getTimerCount()).toBe(0);
  });

  it('does not report an unhandled rejection when an early identification fails and is never taken', async () => {
    const { agent, fake, form, input } = await setup();
    const unhandled = vi.fn();
    process.on('unhandledRejection', unhandled);
    try {
      agent.identifyOnInteraction(form);
      fake.answer('not_initialized');
      input.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
      await flushMicrotasks();
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(unhandled).not.toHaveBeenCalled();
    } finally {
      process.off('unhandledRejection', unhandled);
    }
  });

  it('dispose() removes the listeners', async () => {
    const { agent, fake, form, input } = await setup();
    const remove = vi.spyOn(form, 'removeEventListener');
    const handle = agent.identifyOnInteraction(form);
    handle.dispose();
    expect(remove.mock.calls.map((call) => call[0]).sort()).toEqual(['focusin', 'keydown', 'pointerdown']);
    input.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
    input.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    input.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'a' }));
    await flushMicrotasks();
    expect(fake.calls).toHaveLength(0);
    handle.dispose();
  });

  it('listens in the capture phase, so handlers that stop propagation do not hide interactions', async () => {
    const { agent, fake, form, input } = await setup();
    input.addEventListener('pointerdown', (event) => {
      event.stopPropagation();
    });
    agent.identifyOnInteraction(form);
    input.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    expect(fake.calls).toHaveLength(1);
  });

  it('works with any EventTarget, for example document', async () => {
    const { agent, fake } = await setup();
    const handle = agent.identifyOnInteraction(document);
    document.body.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Tab' }));
    expect(fake.calls).toHaveLength(1);
    handle.dispose();
  });

  it.each([undefined, null, 'form', {}, { addEventListener: () => undefined }])(
    'throws invalid_options for target %s',
    async (target) => {
      const { agent, sdk } = await setup();
      expect(() => agent.identifyOnInteraction(target as never)).toThrow(sdk.ShieldLabsError);
      expect(() => agent.identifyOnInteraction(target as never)).toThrow(
        expect.objectContaining({ code: 'invalid_options' }) as Error,
      );
    },
  );

  it('throws invalid_options for invalid options without adding listeners', async () => {
    const { agent, form } = await setup();
    const add = vi.spyOn(form, 'addEventListener');
    expect(() => agent.identifyOnInteraction(form, { userId: 'anonymous' })).toThrow(
      expect.objectContaining({ code: 'invalid_options' }) as Error,
    );
    expect(add).not.toHaveBeenCalled();
  });
});

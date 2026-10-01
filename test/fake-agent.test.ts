import { describe, expect, it, vi } from 'vitest';
import { createFakeAgent } from './support/fake-agent';
import { flushMicrotasks } from './support/sdk';

// The loader tests rely on this fake behaving like the hosted agent. These tests pin its semantics.
describe('fake agent', () => {
  it('answers asynchronously, exactly once, with a frozen object', async () => {
    const fake = createFakeAgent();
    const onInitialized = vi.fn();
    const returned: unknown = fake.module.forceCheckAnonymous({ onInitialized });
    expect(returned).toBeUndefined();
    expect(onInitialized).not.toHaveBeenCalled();
    await flushMicrotasks();
    expect(onInitialized).toHaveBeenCalledTimes(1);
    const answer = onInitialized.mock.calls[0]?.[0] as { status: string; requestID: string };
    expect(answer.status).toBe('initialized');
    expect(Object.isFrozen(answer)).toBe(true);
  });

  it('ignores a bare function passed as options', async () => {
    const fake = createFakeAgent();
    const onInitialized = vi.fn();
    fake.module.forceCheckAnonymous(onInitialized);
    await flushMicrotasks();
    expect(onInitialized).not.toHaveBeenCalled();
  });

  it('swallows exceptions from the handler', async () => {
    const fake = createFakeAgent();
    fake.module.forceCheckAnonymous({
      onInitialized: () => {
        throw new Error('handler failure');
      },
    });
    await flushMicrotasks();
    expect(fake.calls).toHaveLength(1);
  });

  it('limits non-force calls to one per five minutes and lets force calls through', async () => {
    const fake = createFakeAgent();
    const answers: unknown[] = [];
    const options = {
      onInitialized: (answer: unknown) => {
        answers.push(answer);
      },
    };
    fake.module.checkAuthenticatedUser('hid', options);
    fake.module.checkAuthenticatedUser('hid', options);
    fake.module.forceCheckAuthenticatedUser('hid', options);
    fake.resetWindow();
    fake.module.checkAnonymous(options);
    await flushMicrotasks();
    expect(answers.map((answer) => (answer as { status: string }).status)).toEqual([
      'initialized',
      'not_initialized',
      'initialized',
      'initialized',
    ]);
  });

  it('holds back silent answers until released', async () => {
    const fake = createFakeAgent();
    const onInitialized = vi.fn();
    fake.answer('silent');
    fake.module.forceCheckAnonymous({ onInitialized });
    await flushMicrotasks();
    expect(onInitialized).not.toHaveBeenCalled();
    fake.releaseHeld();
    await flushMicrotasks();
    expect(onInitialized).toHaveBeenCalledTimes(1);
  });
});

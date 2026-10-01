/**
 * A fake of the hosted agent module with the callback semantics of the real one:
 *
 * - four exports: checkAnonymous(options), checkAuthenticatedUser(userHid, options),
 *   forceCheckAnonymous(options), forceCheckAuthenticatedUser(userHid, options);
 * - only `options.onInitialized` on an options object is read, a bare function is ignored;
 * - the callback runs asynchronously, exactly once per call, with one frozen object:
 *   `{ status: 'initialized', requestID }` or `{ status: 'not_initialized' }`;
 * - exceptions thrown by the callback are swallowed, the exports return undefined and never throw;
 * - non-force calls run at most once every five minutes (the visit window), force calls always run.
 *
 * Tests can script the next answers: 'initialized', 'not_initialized', 'silent' (the callback is
 * held back until `releaseHeld()`, like an agent that never answers) or 'throw' (the export throws,
 * which the real agent never does).
 */

export type FakeAnswer = 'initialized' | 'not_initialized' | 'silent' | 'throw';

export interface FakeCall {
  name: string;
  args: unknown[];
}

type Handler = (answer: unknown) => void;

const WINDOW_MS = 5 * 60 * 1000;

let uuidCounter = 0;

/** Deterministic UUIDv4-shaped request IDs. */
export function nextRequestId(): string {
  uuidCounter += 1;
  const tail = uuidCounter.toString(16).padStart(12, '0');
  return `3f2b8c1e-5d4a-4b6f-9e2d-${tail}`;
}

export function createFakeAgent() {
  const calls: FakeCall[] = [];
  /** Every answer delivered to a handler, in order. */
  const answers: { status: string; requestID?: string }[] = [];
  const script: FakeAnswer[] = [];
  const held: (() => void)[] = [];
  let lastCheckAt = Number.NEGATIVE_INFINITY;

  const readHandler = (options: unknown): Handler | undefined => {
    if (typeof options !== 'object' || options === null) return undefined;
    const handler = (options as { onInitialized?: unknown }).onInitialized;
    return typeof handler === 'function' ? (handler as Handler) : undefined;
  };

  const dispatch = (handler: Handler | undefined, answer: { status: string; requestID?: string }): void => {
    queueMicrotask(() => {
      answers.push(answer);
      try {
        handler?.(answer);
      } catch {
        // The real agent swallows exceptions from the handler.
      }
    });
  };

  // Typed `unknown` so tests can assert that the exports return undefined, like the real agent.
  const run = (name: string, force: boolean, args: unknown[], options: unknown): unknown => {
    calls.push({ name, args });
    let answer: FakeAnswer = script.shift() ?? 'initialized';
    if (answer === 'throw') throw new Error('agent failure');
    const handler = readHandler(options);
    if (answer === 'initialized') {
      const now = Date.now();
      if (!force && now - lastCheckAt < WINDOW_MS) answer = 'not_initialized';
      else lastCheckAt = now;
    }
    const result =
      answer === 'not_initialized'
        ? Object.freeze({ status: 'not_initialized' })
        : Object.freeze({ status: 'initialized', requestID: nextRequestId() });
    if (answer === 'silent') {
      held.push(() => {
        dispatch(handler, result);
      });
      return undefined;
    }
    dispatch(handler, result);
    return undefined;
  };

  const module = {
    checkAnonymous: (options?: unknown): unknown => run('checkAnonymous', false, [options], options),
    checkAuthenticatedUser: (userHid: unknown, options?: unknown): unknown =>
      run('checkAuthenticatedUser', false, [userHid, options], options),
    forceCheckAnonymous: (options?: unknown): unknown => run('forceCheckAnonymous', true, [options], options),
    forceCheckAuthenticatedUser: (userHid: unknown, options?: unknown): unknown =>
      run('forceCheckAuthenticatedUser', true, [userHid, options], options),
    default: {},
  };

  return {
    module,
    calls,
    answers,
    /** Queue the answers for the next calls, in order. Unscripted calls answer 'initialized'. */
    answer(...answers: FakeAnswer[]) {
      script.push(...answers);
    },
    /** Deliver the callbacks of 'silent' calls now (a late answer). */
    releaseHeld() {
      for (const release of held.splice(0)) release();
    },
    /** Forget the five-minute window, as if a new visit started. */
    resetWindow() {
      lastCheckAt = Number.NEGATIVE_INFINITY;
    },
  };
}

export type FakeAgent = ReturnType<typeof createFakeAgent>;

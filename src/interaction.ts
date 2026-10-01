import type { IdentifyResult } from './agent';

/** Handle returned by `identifyOnInteraction()`. */
export interface InteractionIdentifier {
  /**
   * The identification for this submission. Returns the one started by the first interaction while
   * it is fresh, or starts `identify()` now: when none is running, when the early one failed, or
   * when it finished more than four minutes ago (servers accept a request ID for five minutes).
   * Every call re-arms the handle, so the next interaction starts a new identification for the
   * next submission.
   *
   * Interactions keep the early identification fresh even without a submission: while users keep
   * interacting with the target, a new identification starts at most every four minutes (and at
   * most every five seconds after a failed one). Each identification is billed.
   */
  take(): Promise<IdentifyResult>;
  /** Removes the event listeners. Call it when the form goes away. */
  dispose(): void;
}

const EVENTS = ['focusin', 'pointerdown', 'keydown'];
const LISTENER_OPTIONS: AddEventListenerOptions = { capture: true, passive: true };
/** An early identification older than this is replaced, so it stays inside a 5-minute freshness window. */
const MAX_AGE = 4 * 60 * 1000;
/** After a failed early identification, the next interaction retries once this much time has passed. */
const RETRY_AFTER = 5000;

export function createInteractionIdentifier(
  identify: () => Promise<IdentifyResult>,
  target: EventTarget,
): InteractionIdentifier {
  let early: Promise<IdentifyResult> | undefined;
  let failed = false;
  /** When the early identification settled; Infinity while it runs. */
  let settledAt = 0;

  const start = (): Promise<IdentifyResult> => {
    const promise = identify();
    early = promise;
    failed = false;
    settledAt = Infinity;
    const settle = (ok: boolean) => (): void => {
      if (early !== promise) return;
      failed = !ok;
      settledAt = Date.now();
    };
    // Also marks the rejection as handled when take() is never called.
    promise.then(settle(true), settle(false));
    return promise;
  };

  const age = (): number => Date.now() - settledAt;

  const onInteraction = (): void => {
    if (!early || age() >= (failed ? RETRY_AFTER : MAX_AGE)) void start();
  };

  const listen = (add: boolean): void => {
    for (const type of EVENTS) {
      if (add) target.addEventListener(type, onInteraction, LISTENER_OPTIONS);
      else target.removeEventListener(type, onInteraction, LISTENER_OPTIONS);
    }
  };

  listen(true);

  return {
    take() {
      const promise = early && !failed && age() < MAX_AGE ? early : start();
      early = undefined;
      return promise;
    },
    dispose() {
      listen(false);
      early = undefined;
    },
  };
}

import { ShieldLabsError } from './errors';
import { createInteractionIdentifier, type InteractionIdentifier } from './interaction';
import { checkIdentifyOptions, invalidOptions, isObject } from './validate';

export interface IdentifyOptions {
  /**
   * User HID: a hashed or pseudonymous account ID computed on your server. Omit it for anonymous
   * checks. Must be a non-empty string other than the reserved values "anonymous", "fail", "-1" and
   * "unknown".
   */
  userId?: string;
  /** Milliseconds to wait for the agent. Overrides `LoadOptions.timeout`. */
  timeout?: number;
}

export interface IdentifyResult {
  /** Send this to your backend with the protected action. */
  requestId: string;
  /** The User HID used, `null` for anonymous checks. */
  userId: string | null;
}

export interface ShieldLabsAgent {
  /**
   * Runs a fresh identification now (the agent's force call). Always creates a new request ID.
   * Use it for protected actions such as signup, login or checkout.
   */
  identify(options?: IdentifyOptions): Promise<IdentifyResult>;
  /**
   * Background check, limited by the agent to one per visit every five minutes. Resolves `null`
   * when the agent skipped it.
   */
  check(options?: IdentifyOptions): Promise<IdentifyResult | null>;
  /**
   * Starts `identify()` on the first interaction with `target` (`focusin`, `pointerdown` or
   * `keydown`) and returns a handle whose `take()` yields the result for this submission, then
   * re-arms. While users keep interacting, a new identification starts at most every four minutes.
   */
  identifyOnInteraction(target: EventTarget, options?: IdentifyOptions): InteractionIdentifier;
}

/** What the agent passes to `onInitialized`: one frozen object, exactly once per call. */
interface AgentAnswer {
  status?: unknown;
  requestID?: unknown;
}

/** The options object of an agent call. The agent reads only `onInitialized`. */
interface AgentCallOptions {
  onInitialized: (answer: AgentAnswer) => void;
}

/** The exports of the hosted agent module that the SDK calls. */
export interface AgentModule {
  checkAnonymous(options: AgentCallOptions): void;
  checkAuthenticatedUser(userHid: string, options: AgentCallOptions): void;
  forceCheckAnonymous(options: AgentCallOptions): void;
  forceCheckAuthenticatedUser(userHid: string, options: AgentCallOptions): void;
}

const AGENT_EXPORTS = ['checkAnonymous', 'checkAuthenticatedUser', 'forceCheckAnonymous', 'forceCheckAuthenticatedUser'];

export function isAgentModule(value: unknown): value is AgentModule {
  return isObject(value) && AGENT_EXPORTS.every((name) => typeof value[name] === 'function');
}

/**
 * One agent call wrapped in a promise that settles exactly once: the request ID, `not_initialized`
 * or `timeout`. The timer is always cleared and a callback that arrives after the timeout is ignored.
 */
function run(mod: AgentModule, force: boolean, options: unknown, defaultTimeout: number): Promise<IdentifyResult> {
  return new Promise<IdentifyResult>((resolve, reject) => {
    const { userId, timeout = defaultTimeout } = checkIdentifyOptions(options);
    let settled = false;

    const timer = setTimeout(() => {
      settled = true;
      reject(new ShieldLabsError('timeout', 'The agent did not answer within ' + String(timeout) + ' ms.'));
    }, timeout);

    const settle = (requestId: unknown, cause?: unknown): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (typeof requestId === 'string' && requestId !== '') {
        resolve({ requestId, userId: userId ?? null });
      } else {
        reject(new ShieldLabsError('not_initialized', 'The agent did not start an identification.', cause));
      }
    };

    // The callback must sit inside an options object: the agent ignores a bare function.
    const callOptions: AgentCallOptions = {
      onInitialized: (answer) => {
        settle(isObject(answer) && answer.status === 'initialized' ? answer.requestID : undefined);
      },
    };

    try {
      if (userId === undefined) {
        if (force) mod.forceCheckAnonymous(callOptions);
        else mod.checkAnonymous(callOptions);
      } else if (force) {
        mod.forceCheckAuthenticatedUser(userId, callOptions);
      } else {
        mod.checkAuthenticatedUser(userId, callOptions);
      }
    } catch (error) {
      settle(undefined, error);
    }
  });
}

export function createAgent(mod: AgentModule, defaultTimeout: number): ShieldLabsAgent {
  const agent: ShieldLabsAgent = {
    identify: (options) => run(mod, true, options, defaultTimeout),

    check: (options) =>
      run(mod, false, options, defaultTimeout).catch((error: unknown) => {
        if (error instanceof ShieldLabsError && error.code === 'not_initialized') return null;
        throw error;
      }),

    identifyOnInteraction(target, options) {
      const candidate: unknown = target;
      if (
        !isObject(candidate) ||
        typeof candidate.addEventListener !== 'function' ||
        typeof candidate.removeEventListener !== 'function'
      ) {
        throw invalidOptions('identifyOnInteraction() needs an EventTarget such as a form.');
      }
      checkIdentifyOptions(options);
      return createInteractionIdentifier(() => agent.identify(options), target);
    },
  };
  return agent;
}

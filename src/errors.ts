/** The reason behind a {@link ShieldLabsError}. */
export type ShieldLabsErrorCode =
  | 'invalid_options'
  | 'unsupported_environment'
  | 'load_failed'
  | 'not_initialized'
  | 'timeout';

/**
 * The only error type the SDK throws or rejects with. Branch on `code`; the message is for people.
 *
 * - `invalid_options`: an option failed validation. Nothing was loaded or called.
 * - `unsupported_environment`: no browser page (server-side rendering, a worker) or the page is
 *   not a secure context.
 * - `load_failed`: the agent module could not be imported from the CDN.
 * - `not_initialized`: the agent did not start an identification.
 * - `timeout`: the agent did not answer in time.
 */
export class ShieldLabsError extends Error {
  /** Machine-readable reason. */
  readonly code: ShieldLabsErrorCode;
  /** The underlying error, when there is one (for example the failed import). */
  readonly cause?: unknown;

  constructor(code: ShieldLabsErrorCode, message: string, cause?: unknown) {
    super(message);
    this.name = 'ShieldLabsError';
    this.code = code;
    if (cause !== undefined) this.cause = cause;
  }
}

// The builds shorten local names, which would rename the class itself. Error logs (for example
// Node's util.inspect) print the class name next to `error.name`, so keep it readable.
Object.defineProperty(ShieldLabsError, 'name', { value: 'ShieldLabsError' });

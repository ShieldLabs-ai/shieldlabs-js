import { ShieldLabsError } from './errors';

/** The agent's own rule for a Public Key. */
const PUBLIC_KEY = /^[A-Za-z0-9_-]{1,128}$/;
/** Public Keys issued today: 32 lowercase hex characters. Older accounts can have other shapes. */
const ISSUED_PUBLIC_KEY = /^[0-9a-f]{32}$/;
/** The Private API Key (`sec_…`) and webhook signing secrets (`whsec_…`) belong on the server only. */
const SERVER_SECRET = /^(wh)?sec_/;
/** User HID values that ShieldLabs uses for checks without a user. */
const RESERVED_USER_IDS = ['anonymous', 'fail', '-1', 'unknown'];
/**
 * User HIDs that are hard or impossible to look up in the History API, where the value is a URL path
 * segment: `/`, `?`, `#` or `%` inside, or the whole value `.` or `..`.
 */
const HARD_TO_SEARCH = /[/?#%]|^\.\.?$/;
const EMAIL_LIKE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
/** Largest delay `setTimeout` accepts without overflowing. */
const MAX_TIMEOUT = 2147483647;

const warned: Record<string, boolean> = {};

/** `console.warn` once per kind of problem for the lifetime of the page. */
export function warnOnce(kind: string, message: string): void {
  if (warned[kind]) return;
  warned[kind] = true;
  console.warn('[ShieldLabs] ' + message);
}

export function invalidOptions(message: string): ShieldLabsError {
  return new ShieldLabsError('invalid_options', message);
}

export function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export function checkPublicKey(value: unknown): string {
  if (typeof value !== 'string' || !PUBLIC_KEY.test(value)) {
    throw invalidOptions('publicKey must match ^[A-Za-z0-9_-]{1,128}$ (the Public Key of your domain).');
  }
  if (SERVER_SECRET.test(value)) {
    // Never echo the value: it is a credential.
    throw invalidOptions(
      'publicKey is a server-side secret (sec_ or whsec_). Remove it from browser code, rotate it in the analytics dashboard and pass the Public Key of your domain.',
    );
  }
  if (!ISSUED_PUBLIC_KEY.test(value)) {
    warnOnce('publicKey', 'publicKey is not 32 lowercase hex characters. Is it the Public Key of your domain?');
  }
  return value;
}

export function checkTimeout(value: unknown): number | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'number' || !(value > 0 && value <= MAX_TIMEOUT)) {
    throw invalidOptions('timeout must be a number of milliseconds above 0.');
  }
  return value;
}

export function checkUserId(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'string' || value.trim() === '') {
    throw invalidOptions('userId must be a non-empty string. Omit it for anonymous checks.');
  }
  if (RESERVED_USER_IDS.includes(value)) {
    throw invalidOptions('userId "' + value + '" is reserved. Omit it for anonymous checks.');
  }
  if (HARD_TO_SEARCH.test(value)) {
    warnOnce('userIdCharacters', 'userId is . or .. or contains / ? # or %, which the History API cannot always search. Use a hex hash.');
  }
  if (EMAIL_LIKE.test(value)) {
    warnOnce('userIdEmail', 'userId looks like an email address. Pass a User HID computed on your server instead.');
  }
  return value;
}

export interface CheckedIdentifyOptions {
  userId: string | undefined;
  timeout: number | undefined;
}

export function checkIdentifyOptions(options: unknown): CheckedIdentifyOptions {
  if (options === undefined || options === null) return { userId: undefined, timeout: undefined };
  if (!isObject(options)) throw invalidOptions('options must be an object.');
  return { userId: checkUserId(options.userId), timeout: checkTimeout(options.timeout) };
}

import { describe, expect, it } from 'vitest';
import { ShieldLabsError } from '../src/index';

describe('ShieldLabsError', () => {
  it('is an Error with a name, a code and a message', () => {
    const error = new ShieldLabsError('timeout', 'The agent did not answer within 10000 ms.');
    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(ShieldLabsError);
    expect(error.name).toBe('ShieldLabsError');
    expect(error.code).toBe('timeout');
    expect(error.message).toBe('The agent did not answer within 10000 ms.');
    expect(error.cause).toBeUndefined();
    expect('cause' in error).toBe(false);
    expect(typeof error.stack).toBe('string');
  });

  it('keeps its class name', () => {
    expect(ShieldLabsError.name).toBe('ShieldLabsError');
    expect(new ShieldLabsError('timeout', 'x').constructor.name).toBe('ShieldLabsError');
  });

  it('keeps the cause', () => {
    const cause = new TypeError('Failed to fetch dynamically imported module');
    const error = new ShieldLabsError('load_failed', 'Could not load the ShieldLabs agent.', cause);
    expect(error.cause).toBe(cause);
    expect(String(error)).toBe('ShieldLabsError: Could not load the ShieldLabs agent.');
  });
});

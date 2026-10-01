// @vitest-environment node
import { pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';
import { importAgent } from '../src/import-agent';

describe('importAgent()', () => {
  it('imports the module at the given URL at runtime', async () => {
    const url = pathToFileURL(new URL('./support/agent-module.mjs', import.meta.url).pathname).href;
    const mod = (await importAgent(url)) as Record<string, unknown>;
    expect(typeof mod.forceCheckAnonymous).toBe('function');
    expect(typeof mod.checkAuthenticatedUser).toBe('function');
  });

  it('rejects when the module cannot be imported', async () => {
    await expect(importAgent(pathToFileURL('/nonexistent/snippet.js').href)).rejects.toBeDefined();
  });
});

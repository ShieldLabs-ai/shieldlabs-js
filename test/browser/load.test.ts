// @vitest-environment node
// Runs the built dist/index.js in Chromium (`npm run test:browser` builds first). Unit tests replace
// the dynamic import, so only a real browser shows how module loading behaves: for example, a
// browser remembers a failed module load per URL and never fetches that URL again.
import { readFileSync } from 'node:fs';
import { chromium, type Browser, type BrowserContext, type Page, type Route } from 'playwright-core';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

declare global {
  interface Window {
    sdk: typeof import('../../src/index');
    agentInstances?: number;
  }
}

const ORIGIN = 'https://shop.example.com';
const PUBLIC_KEY = '0123456789abcdef0123456789abcdef';
const AGENT_URL = `https://cdn.shieldlabs.ai/snippet.js?publicKey=${PUBLIC_KEY}`;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

const PAGE = `<!doctype html>
<meta charset="utf-8" />
<title>@shieldlabs-ai/js browser test</title>
<script type="module">
  import * as sdk from '/index.js';
  window.sdk = sdk;
</script>`;

// A stand-in for the hosted agent with its callback contract. It counts how often the module is
// evaluated, so a test can tell whether the page ended up with a second agent instance.
const FAKE_AGENT = `
window.agentInstances = (window.agentInstances || 0) + 1;
const answer = (options) => {
  if (options && typeof options.onInitialized === 'function') {
    const requestID = crypto.randomUUID();
    queueMicrotask(() => options.onInitialized(Object.freeze({ status: 'initialized', requestID })));
  }
};
export const checkAnonymous = (options) => answer(options);
export const checkAuthenticatedUser = (userHid, options) => answer(options);
export const forceCheckAnonymous = (options) => answer(options);
export const forceCheckAuthenticatedUser = (userHid, options) => answer(options);
`;

const AGENT_RESPONSE = {
  status: 200,
  contentType: 'text/javascript',
  headers: { 'access-control-allow-origin': '*' },
  body: FAKE_AGENT,
};

const sdkSource = readFileSync(new URL('../../dist/index.js', import.meta.url), 'utf8');

let browser: Browser;
let context: BrowserContext | undefined;

beforeAll(async () => {
  browser = await chromium.launch();
});

afterEach(async () => {
  await context?.close();
  context = undefined;
});

afterAll(async () => {
  await browser.close();
});

/** Opens an HTTPS page with the SDK. `agent` answers each request for the agent module. */
async function openPage(agent: (route: Route, attempt: number) => Promise<void>) {
  context = await browser.newContext();
  const agentRequests: string[] = [];
  await context.route(`${ORIGIN}/**`, (route) =>
    new URL(route.request().url()).pathname === '/index.js'
      ? route.fulfill({ contentType: 'text/javascript', body: sdkSource })
      : route.fulfill({ contentType: 'text/html', body: PAGE }),
  );
  await context.route('https://cdn.shieldlabs.ai/**', (route) => {
    agentRequests.push(route.request().url());
    return agent(route, agentRequests.length);
  });
  const page = await context.newPage();
  await page.goto(`${ORIGIN}/signup`);
  await page.waitForFunction(() => 'sdk' in window);
  expect(await page.evaluate(() => window.isSecureContext)).toBe(true);
  return { page, agentRequests };
}

/** load() then identify() in the page: the request ID, or `error:<code>`. */
function identifyInPage(page: Page, timeout?: number): Promise<string> {
  return page.evaluate(
    async ({ publicKey, timeout }) => {
      try {
        const agent = await window.sdk.load(timeout === undefined ? { publicKey } : { publicKey, timeout });
        return (await agent.identify()).requestId;
      } catch (error) {
        return 'error:' + String((error as { code?: unknown }).code);
      }
    },
    { publicKey: PUBLIC_KEY, timeout },
  );
}

describe('load() in Chromium', () => {
  it('retries a failed load with a new URL, then keeps the loaded agent', async () => {
    const { page, agentRequests } = await openPage((route, attempt) => {
      if (attempt === 1) return route.fulfill({ status: 503, body: 'Service Unavailable' });
      if (attempt === 2) return route.abort('connectionreset');
      return route.fulfill(AGENT_RESPONSE);
    });

    expect(await identifyInPage(page)).toBe('error:load_failed');
    expect(await identifyInPage(page)).toBe('error:load_failed');
    expect(await identifyInPage(page)).toMatch(UUID);
    expect(await identifyInPage(page)).toMatch(UUID);

    expect(agentRequests).toEqual([AGENT_URL, `${AGENT_URL}&retry=1`, `${AGENT_URL}&retry=2`]);
    expect(await page.evaluate(() => window.agentInstances)).toBe(1);
  });

  it('times out a stalled load, lets the import finish and reuses it without a second agent', async () => {
    let stalled: Route | undefined;
    const { page, agentRequests } = await openPage((route) => {
      stalled = route; // no answer until the test releases it
      return Promise.resolve();
    });

    expect(await identifyInPage(page, 500)).toBe('error:timeout');
    expect(stalled).toBeDefined();

    const next = identifyInPage(page, 5000);
    await stalled?.fulfill(AGENT_RESPONSE);
    expect(await next).toMatch(UUID);

    expect(agentRequests).toEqual([AGENT_URL]);
    expect(await page.evaluate(() => window.agentInstances)).toBe(1);
  });
});

# @shieldlabs-ai/js

Load the ShieldLabs agent in the browser and get a request ID for every identification, with
promises, TypeScript types and safe defaults.

[![CI](https://github.com/ShieldLabs-ai/shieldlabs-js/actions/workflows/ci.yml/badge.svg)](https://github.com/ShieldLabs-ai/shieldlabs-js/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/@shieldlabs-ai/js)](https://www.npmjs.com/package/@shieldlabs-ai/js)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue)](./LICENSE)

`@shieldlabs-ai/js` is a small loader (about 2.5 kB min+gzip, no dependencies). At runtime it imports the
hosted ShieldLabs agent from `https://cdn.shieldlabs.ai` and wraps its callbacks in promises.
Identification runs in the agent; scoring runs on ShieldLabs servers.

New to ShieldLabs? [Start free](https://app.shieldlabs.ai), then copy the Public Key of your domain
from Integration > API keys in the analytics dashboard (the Install tab also shows a ready snippet
that contains it).

## How it fits

1. **Browser.** `@shieldlabs-ai/js` loads the agent and runs an identification. The page receives a
   `requestId`.
2. **Your backend.** It receives the `requestId` with the protected action (signup, login,
   checkout) and reads the verdict for it from the History API with a ShieldLabs server SDK, or
   receives it in a signed `identification.scored` webhook.
3. **Decision.** Your backend acts on the Risk Score (bands: trusted 0-29, suspicious 30-59,
   dangerous 60-100), the detection flags and identifiers such as the device ID.

The browser only ever gets the request ID. The Risk Score, risk signals, detection flags, visitor ID
and device ID are read on your server. The webhook is delivered once per identification today
(1 second timeout, no retries), so use the History API when your backend must have the verdict, and
make the webhook handler idempotent on `data.request_id`: future retries will resend identical bytes.

## Install

```bash
npm install @shieldlabs-ai/js
# or
yarn add @shieldlabs-ai/js
# or
pnpm add @shieldlabs-ai/js
```

Without a bundler, use the IIFE build, which defines the global `ShieldLabsJS`:

```html
<script src="https://cdn.jsdelivr.net/npm/@shieldlabs-ai/js@1.0.0/dist/shieldlabs.iife.js"></script>
<script>
  ShieldLabsJS.load({ publicKey: '0123456789abcdef0123456789abcdef' })
    .then((agent) => {
      // agent.identify(), agent.check(), agent.identifyOnInteraction(form)
    })
    .catch((error) => console.warn('ShieldLabs:', error.code, error.message));
</script>
```

The same file ships in the package as `dist/shieldlabs.iife.js` if you prefer to serve it from your
own origin. Pin the version you use. This file is only the loader: the agent itself always comes
from `https://cdn.shieldlabs.ai`.

## Quick start

```ts
import { load, type LoadOptions } from '@shieldlabs-ai/js';

const options: LoadOptions = { publicKey: import.meta.env.VITE_SHIELDLABS_PUBLIC_KEY };

// Start loading the agent now, but do not await it here: the form must keep working when the
// agent cannot load (a content blocker, a network error).
load(options).catch(() => {}); // handled in the submit handler

const form = document.querySelector<HTMLFormElement>('#signup')!;
form.addEventListener('submit', async (event) => {
  event.preventDefault();
  let requestId: string | null = null;
  try {
    // load() again: it returns the loaded agent at once, waits for a load that is still running
    // and tries again after a failed one.
    const agent = await load(options);
    ({ requestId } = await agent.identify());
  } catch {
    // No identification: send the signup anyway. Your server treats it as unverified.
  }
  await fetch('/api/signup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: form.email.value, requestId }),
  });
});
```

Avoid a top-level `await load(...)`. When the agent is blocked, the rest of the module never runs,
so the submit handler is never attached. Some build targets also reject top-level `await`. Call
`load()` again wherever you need the agent rather than keeping its first promise: that promise stays
rejected after a passing network error or a slow load, and a new call recovers from both.

On your server, read the verdict for `requestId` with a ShieldLabs server SDK, for example
`identifications.get(requestId)` in [`@shieldlabs-ai/node`](https://github.com/ShieldLabs-ai/shieldlabs-node),
which waits until the identification has been scored. The History row appears about 1 to 3 seconds
after the browser call and can be refined for up to about 10 seconds while follow-up checks finish,
so start the identification when the user begins the action, for example with
`identifyOnInteraction()` (see [Protect a form](#protect-a-form)).

> **Keep the page alive after `identify()` resolves.** The agent posts the identification right
> after it hands over the request ID. Keep the page open until your own request has been sent, and
> do not navigate away the moment `identify()` resolves (for example with `location.href = ...` in
> its `then` callback): the agent's post may not have gone out yet. For classic full-page form
> posts, start the identification early with `identifyOnInteraction()` (see the guide).

> **Test on a registered domain.** ShieldLabs records identifications only for the domains
> registered in your account. On `localhost` the page still receives a `requestId`, but the
> identification is rejected with `401` and your backend never finds it. Test on a development
> domain with its own keys, as described in [Environments](https://docs.shieldlabs.ai/setup/environments).

## Guide

### Protect a form

`identifyOnInteraction(form)` starts `identify()` on the first `focusin`, `pointerdown` or `keydown`
inside the form. By the time the user submits, the identification is usually done. `take()` returns
it for this submission and re-arms the handle, so the next submission gets its own request ID.

```ts
import { load, ShieldLabsError, type InteractionIdentifier, type LoadOptions } from '@shieldlabs-ai/js';

const options: LoadOptions = { publicKey: import.meta.env.VITE_SHIELDLABS_PUBLIC_KEY };
const form = document.querySelector<HTMLFormElement>('#signup')!;

// One handle for the form, created once the agent has loaded. load() reuses the loaded agent on
// every call and tries again after a failed load, so a submit after a failure still recovers.
let handle: InteractionIdentifier | undefined;
async function identifier(): Promise<InteractionIdentifier> {
  const agent = await load(options);
  return (handle ??= agent.identifyOnInteraction(form));
}
identifier().catch(() => {}); // start loading now; errors are handled in the submit handler

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  let requestId: string | null = null;
  try {
    ({ requestId } = await (await identifier()).take());
  } catch (error) {
    // No identification: send the form anyway. Your server treats it as unverified.
    if (error instanceof ShieldLabsError) console.warn(error.code, error.message);
  }
  await fetch('/api/signup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: form.email.value, requestId }),
  });
});
```

For a classic full-page post, put the request ID in a hidden field and submit the form yourself:

```html
<form id="signup" action="/signup" method="post">
  <input name="email" type="email" required />
  <input type="hidden" name="requestId" />
  <button>Sign up</button>
</form>
```

```ts
form.addEventListener('submit', async (event) => {
  event.preventDefault();
  try {
    const { requestId } = await (await identifier()).take();
    (form.elements.namedItem('requestId') as HTMLInputElement).value = requestId;
  } catch {
    // No identification: submit without a requestId. Your server treats it as unverified.
  }
  form.submit();
});
```

Because the identification starts on the first interaction, it has normally finished posting by the
time the user submits. If users can submit without interacting first (for example autofill and a
single click on the button), prefer sending the form with `fetch()`, which keeps the page alive.

`take()` hands out the early identification only while it is fresh. When it failed, or finished more
than 4 minutes ago, `take()` starts a new one, so the request ID your server receives stays inside a
5-minute freshness window (replacing a stale one costs one more identification). Interactions keep
the early identification fresh as well, even when nothing is submitted: while users keep interacting
with the form, a new identification starts at most every 4 minutes, and after a failure the next
interaction starts a new attempt, at most one every 5 seconds. Each of them is billed.

When the form goes away (for example when a single-page app leaves the route), call
`handle?.dispose()` to remove the listeners and set `handle = undefined`. On the server, accept each
request ID once and only within your freshness window (the examples use 5 minutes): one
identification authorizes one protected action.

### Signed-in users: pass a User HID

Pass a User HID so ShieldLabs ties the identification to the account. Compute it **on your server**
from your account ID with a secret key, for example with the `userHid()` helper of the ShieldLabs
server SDKs (HMAC-SHA256, 64 hex characters), and render it into the page:

```ts
// server (Node.js)
import { userHid } from '@shieldlabs-ai/node';
const hid = userHid(String(account.id), userHidSecret); // a secret you keep on the server
```

```ts
// browser (load and options as in the quick start): call it when the signed-in user submits
async function identifySignedIn(userHid: string): Promise<string | null> {
  try {
    const agent = await load(options);
    return (await agent.identify({ userId: userHid })).requestId;
  } catch {
    return null; // no identification: send the action anyway, your server treats it as unverified
  }
}
```

Never pass a raw email address, phone number or database ID. The SDK rejects the reserved values
`"anonymous"`, `"fail"`, `"-1"` and `"unknown"` with `invalid_options`, and logs a one-time warning
for values that look like an email address, contain `/`, `?`, `#` or `%`, or are `.` or `..`. The
History API looks a User HID up as a URL path segment: it cannot search a value that contains `/`,
the ShieldLabs server SDKs reject `.` and `..` there, and the other characters are easy to escape
wrongly. Use a hex hash. Omit `userId` for visitors who are not signed in.

### Background checks with `check()`

`check()` runs the agent's limited check: at most one identification per visit every five minutes
for the same user, shared across tabs. It resolves `null` when the agent skipped the check. Use it
for passive monitoring of a visit, for example once after sign-in:

```ts
// hid: the User HID your server rendered into the page
async function monitorVisit(hid: string): Promise<void> {
  try {
    const agent = await load(options);
    const result = await agent.check({ userId: hid });
    if (result) {
      // Optional: send result.requestId to your backend to follow the visit.
    }
  } catch {
    // Passive monitoring only: nothing to do when the agent is not available.
  }
}
```

Use `identify()` for protected actions: it always runs and always returns a new request ID.

### Frameworks

The framework packages load the agent once per app and add loading and error state:

- React: [`@shieldlabs-ai/react`](https://github.com/ShieldLabs-ai/shieldlabs-react)
- Vue and Nuxt: [`@shieldlabs-ai/vue`](https://github.com/ShieldLabs-ai/shieldlabs-vue)
- Angular: [`@shieldlabs-ai/angular`](https://github.com/ShieldLabs-ai/shieldlabs-angular)
- Svelte and SvelteKit: [`@shieldlabs-ai/svelte`](https://github.com/ShieldLabs-ai/shieldlabs-svelte)
- Next.js: [`@shieldlabs-ai/next`](https://github.com/ShieldLabs-ai/shieldlabs-next)

### Server-side rendering

Importing `@shieldlabs-ai/js` has no side effects and touches no browser globals, so it is safe in
server bundles. `load()` rejects with `unsupported_environment` on the server and in workers: call
it in the browser, for example in an effect or a mount hook. Calls are memoized per agent URL and
Public Key, so mounting a component twice (or React StrictMode) loads the agent once.

### Development environment and `scriptUrl`

For your own development and staging sites, keep the default environment and register a separate
domain with its own keys (see [Environments](https://docs.shieldlabs.ai/setup/environments)).
`environment: 'development'` loads the agent of the ShieldLabs development environment
(`https://dev.cdn.shieldlabs.ai/snippet.js`). `scriptUrl` overrides the agent module URL for tests:
it must be an absolute `https` URL (plain `http` is accepted only for `localhost` and `127.0.0.1`),
and the SDK adds the `publicKey` query parameter.

## Call budget

Every identification that runs is billed and takes part of a small per-IP budget, so call the agent
only when it matters:

- Call `identify()` once per protected action. Never call the agent on every render or on every
  client-side route change.
- The ingest accepts about 15 requests per minute per visitor IP, and one identification uses 4 to 5
  of them. An IP over the limit is blocked for 10 minutes. During the block `identify()` still
  resolves with a request ID, but the ingest rejects the identification, so your backend never finds
  it (`identifications.get()` returns `null`): treat it as unverified. The block itself can appear
  once as a separate identification with the Risk Score marker 999 and its own request ID, never
  under the request IDs your page received.
- Never clear the agent's storage (its first-party cookie ID in `localStorage` and a cookie). Several
  fresh cookie IDs from one device in a short time raise a browser automation risk signal.
- The agent also runs its own limited background checks: it patches `history.pushState` and
  `history.replaceState` and checks again on clicks, key presses, form submits and navigation once
  its five-minute window has passed. The page never receives those request IDs, so your backend can
  see extra identifications for the same user and session.

## Content Security Policy

If your site sends a `Content-Security-Policy` header, allow the agent's origins:

```
script-src  'self' https://cdn.shieldlabs.ai;
connect-src 'self' https://rest.shieldlabs.ai wss://rest.shieldlabs.ai https://webrtc.shieldlabs.ai stun:ice.shieldlabs.ai:3478;
```

| Directive | Origin | Used for |
|---|---|---|
| `script-src` | `https://cdn.shieldlabs.ai` | The agent module (`snippet.js`) and its supporting modules |
| `connect-src` | `https://rest.shieldlabs.ai` | Posting the identification |
| `connect-src` | `wss://rest.shieldlabs.ai` | The WebSocket used by the network check |
| `connect-src` | `https://webrtc.shieldlabs.ai` | The network check session |
| `connect-src` | `stun:ice.shieldlabs.ai:3478` | The network check (STUN) |

The agent is loaded with a dynamic `import()`, so the policy does not need `'unsafe-eval'`. If
`https://webrtc.shieldlabs.ai` is blocked, identifications still arrive but can carry the
`stun_not_checked` risk signal. If you load the IIFE build from a public npm CDN, add that origin to
`script-src` as well. Details: [Content Security Policy](https://docs.shieldlabs.ai/setup/csp).

## Consent

The agent does not read your consent banner or consent manager. Where your policy or applicable law
requires consent, call `load()` and any identification only after consent is given (for example
from your consent manager's accept callback). The agent keeps a first-party cookie ID (`cookieID`,
in `localStorage` and a first-party cookie); list it in your cookie notice with its fraud prevention
purpose. Never pass directly identifying data as the User HID.

## Reference

| Export | Description |
|---|---|
| `load(options: LoadOptions): Promise<ShieldLabsAgent>` | Imports the agent from the CDN and resolves an agent. Memoized per agent URL and Public Key; concurrent calls share one import; a failed import is retried on the next call (with a new URL, because browsers remember a failed module load); rejects with `timeout` when the agent does not load within `timeout`, while the import keeps running for later calls |
| `ShieldLabsError` | The only error type the SDK throws or rejects with. Has `code` and optional `cause` |
| `VERSION` | The package version, for example `"1.0.0"` |
| Types | `LoadOptions`, `IdentifyOptions`, `IdentifyResult`, `ShieldLabsAgent`, `InteractionIdentifier`, `ShieldLabsErrorCode` |

`LoadOptions`

| Option | Type | Default | Description |
|---|---|---|---|
| `publicKey` | `string` | required | Public Key of your domain. Must match `^[A-Za-z0-9_-]{1,128}$`; a one-time warning is logged when it is not 32 lowercase hex characters. Server-side secrets (`sec_…`, `whsec_…`) are rejected |
| `environment` | `'production' \| 'development'` | `'production'` | Which ShieldLabs CDN to load the agent from |
| `scriptUrl` | `string` | | Advanced: agent module URL override (`https`, or `http` on `localhost` and `127.0.0.1`) |
| `timeout` | `number` | `10000` | Milliseconds to wait for the agent to load, and the default for each agent call |

`ShieldLabsAgent`

| Method | Returns | Description |
|---|---|---|
| `identify(options?)` | `Promise<IdentifyResult>` | Fresh identification now (the agent's force call). Always a new request ID. Use it for protected actions |
| `check(options?)` | `Promise<IdentifyResult \| null>` | Background check, limited by the agent to one per visit every five minutes. `null` when the agent skipped it |
| `identifyOnInteraction(target, options?)` | `InteractionIdentifier` | Starts `identify()` on the first `focusin`, `pointerdown` or `keydown` on `target` |

`IdentifyOptions`

| Option | Type | Description |
|---|---|---|
| `userId` | `string` | User HID computed on your server. Omit for anonymous checks. Must be a non-empty string other than `"anonymous"`, `"fail"`, `"-1"` and `"unknown"` |
| `timeout` | `number` | Milliseconds to wait for this call. Overrides `LoadOptions.timeout` |

`IdentifyResult`

| Field | Type | Description |
|---|---|---|
| `requestId` | `string` | Send it to your backend with the protected action |
| `userId` | `string \| null` | The User HID used, `null` for anonymous checks |

`InteractionIdentifier`

| Method | Description |
|---|---|
| `take(): Promise<IdentifyResult>` | The identification for this submission: the early one while it is fresh, otherwise a new `identify()` (when none is running, the early one failed, or it finished more than 4 minutes ago). Then re-arms for the next submission. While the form is in use, interactions also start a new identification at most every 4 minutes |
| `dispose(): void` | Removes the event listeners |

## Errors and retries

Every error is a `ShieldLabsError`. Branch on `error.code`:

| `code` | When | What to do |
|---|---|---|
| `invalid_options` | An option failed validation (`publicKey`, `environment`, `scriptUrl`, `timeout`, `userId`, the interaction target), or `publicKey` holds a server-side secret (`sec_…`, `whsec_…`). Nothing was loaded or called | Fix the call; retrying does not help. Rotate a secret that reached browser code |
| `unsupported_environment` | No browser page (server-side rendering, a worker), or the page is not a secure context | Call `load()` in the browser; serve the page over HTTPS (`localhost` and `127.0.0.1` also work over `http`) |
| `load_failed` | The agent module could not be imported: network error, content blocker, Content Security Policy, wrong `scriptUrl`. `cause` holds the original error | Continue without an identification. You can call `load()` again later: failed loads are not cached, and the next call imports the agent again |
| `not_initialized` | `identify()` only: the agent did not start an identification, for example because another one is running in this or another tab. `check()` resolves `null` instead | Retry once later, or continue without an identification |
| `timeout` | The agent did not load, or an agent call did not answer, within the timeout (default 10 seconds) | Continue without an identification. A load that timed out keeps running, and a later `load()` call uses it once it arrives; a late answer to an agent call is ignored |

Whenever there is no identification, send the protected action anyway without a `requestId`: your
backend treats a missing identification as unverified (for example step-up or review), never as
clean.

The SDK never repeats an agent call on its own, because every `identify()` is a billable
identification. `load()` is safe to call again at any time: it returns the loaded agent at once,
waits for a load that is still running, and imports the agent again (with a new URL) after a failed
load.

## Compatibility

- Browsers that support ES modules, dynamic `import()` and WebCrypto: current versions of Chrome,
  Edge, Firefox, Safari, Opera and Samsung Internet, on desktop and mobile.
- The page must be a secure context: HTTPS, or `http://localhost` and `http://127.0.0.1` during
  development.
- Output: ES2019 syntax as ESM, CommonJS and a minified IIFE (`window.ShieldLabsJS`), with bundled
  TypeScript declarations. No runtime dependencies.
- Bundlers: the runtime import carries the `webpackIgnore` and `@vite-ignore` hints, so webpack
  (including Next.js) and Vite leave the CDN URL alone.
- Server runtimes (Node.js 18+, Bun, Deno, edge): safe to import; `load()` rejects there.

## Development

```bash
npm ci
npm run typecheck
npm run lint
npm test -- --coverage   # builds first, then runs the tests
npm run test:browser     # runs the built package in Chromium (npx playwright-core install chromium)
npm run build
npm run size             # dist/index.js must stay at or below 3072 bytes gzip
```

See [CONTRIBUTING.md](./CONTRIBUTING.md). Documentation: <https://docs.shieldlabs.ai>. Analytics
dashboard: <https://app.shieldlabs.ai>. Support: <contact@shieldlabs.ai>.

## License

[MIT](./LICENSE), Copyright (c) 2026 ShieldLabs Inc.

# Changelog

All notable changes to `@shieldlabs-ai/js` are documented in this file. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the package uses
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.0.0] - 2026-09-30

### Added

- `load(options)`: imports the hosted agent from `https://cdn.shieldlabs.ai/snippet.js` at runtime
  and resolves a `ShieldLabsAgent`. Memoized per agent URL and Public Key: concurrent calls share one
  import. A failed import is retried on the next call with a new URL, because browsers remember a
  failed module load per URL. The import is bounded by `timeout`: a call that runs out of time
  rejects with `timeout`, and the import keeps running for later calls.
- `ShieldLabsAgent.identify()`: a fresh identification with a new request ID on every call, for
  protected actions.
- `ShieldLabsAgent.check()`: the agent's limited background check (one per visit every five
  minutes); resolves `null` when the agent skips it.
- `ShieldLabsAgent.identifyOnInteraction(target)`: starts an identification on the first `focusin`,
  `pointerdown` or `keydown` on a form; `take()` returns it for the submission while it is fresh
  (a new one starts when the early one failed or finished more than four minutes ago) and re-arms;
  while the form is in use, interactions start a new identification at most every four minutes, and
  after a failure at most every five seconds; `dispose()` removes the listeners.
- `ShieldLabsError` with the codes `invalid_options`, `unsupported_environment`, `load_failed`,
  `not_initialized` and `timeout`, and `VERSION`.
- Option checks: the agent's Public Key rule with a one-time warning for keys that are not 32
  lowercase hex characters, and server-side secrets (`sec_…`, `whsec_…`) rejected as `publicKey`;
  User HID rules (non-empty, reserved values rejected) with one-time warnings for email-like values,
  for `/`, `?`, `#` and `%`, and for the values `.` and `..` (User HIDs that are hard or impossible
  to look up in the History API).
- Timeouts for loading the agent and for each agent call (default 10 seconds) that never leave
  timers behind; late agent answers are ignored.
- `unsupported_environment` during server-side rendering, in workers and on pages that are not a
  secure context (`localhost` and `127.0.0.1` are allowed over `http`).
- `environment` (`production` or `development`) and `scriptUrl` options.
- ESM, CommonJS and TypeScript declarations, plus a minified IIFE build that defines
  `window.ShieldLabsJS`. No runtime dependencies.
- Examples: `examples/vanilla` (script tag, classic form post) and `examples/vite` (TypeScript
  signup form).

### Removed

- The `0.1.0` placeholder API (`getResult()`, `DEFAULT_SCRIPT_URL`). The browser receives a request
  ID; results are read on your server.

[Unreleased]: https://github.com/ShieldLabs-ai/shieldlabs-js/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/ShieldLabs-ai/shieldlabs-js/releases/tag/v1.0.0

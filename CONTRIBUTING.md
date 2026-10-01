# Contributing to @shieldlabs-ai/js

Thank you for improving the ShieldLabs browser loader.

## Set up

You need Node.js 20 or later. In your working copy of the repository:

```bash
npm ci
```

## Checks

Run these before you open a pull request. CI runs the same steps on Node.js 20, 22 and 24.

```bash
npm run typecheck
npm run lint
npm test -- --coverage   # builds first; coverage must stay at 90 % or more
npm run test:browser     # the built package in Chromium; first run: npx playwright-core install chromium
npm run build
npm run size             # dist/index.js at or below 3072 bytes gzip
```

## Guidelines

- The package stays a thin loader with no runtime dependencies. `src/import-agent.ts` is the only
  module that imports the agent, always from the ShieldLabs CDN at runtime: never bundle, mirror or
  proxy the agent.
- Every change comes with tests. The fake agent in `test/support/fake-agent.ts` mirrors the agent's
  callback contract; keep it in line with the real agent.
- Keep `src/version.ts` equal to the version in `package.json` (a test checks it).
- Use conventional commit messages (`feat:`, `fix:`, `docs:`, `test:`, `ci:`, `chore:`) and add a
  line to `CHANGELOG.md` under "Unreleased".
- Documentation style: plain technical English, "risk signals", and the three risk bands trusted
  0-29, suspicious 30-59 and dangerous 60-100.

## Releasing

Maintainers update the version in `package.json` and `src/version.ts`, move the "Unreleased"
changelog entries under the new version, and push a tag such as `v1.0.1`. The release workflow
checks that the tag matches `package.json`, runs all checks and packs the package with read-only
permissions. A second job in the `npm` environment then publishes that tarball to npm with
provenance, using the `NPM_TOKEN` secret. Give the `npm` environment required reviewers in the
repository settings. Re-running the workflow is safe: a version that is already on npm is skipped.

## Security

Please report security issues privately to <contact@shieldlabs.ai> rather than in a public issue.

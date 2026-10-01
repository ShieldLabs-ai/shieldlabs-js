# Vite example

A small TypeScript signup form. It loads the ShieldLabs agent with `@shieldlabs-ai/js`, starts an
identification on the first interaction with the form (`identifyOnInteraction`) and sends the
`requestId` to your backend with the signup request.

## Run it

```bash
npm install
cp .env.example .env   # then set VITE_SHIELDLABS_PUBLIC_KEY
npm run dev
```

Open the URL Vite prints (for example <http://localhost:5173>). The form posts JSON to
`/api/signup`: point it at your server, which reads the verdict for `requestId` with a ShieldLabs
server SDK (for example `identifications.get(requestId)` in `@shieldlabs-ai/node`).

ShieldLabs accepts identifications only from registered domains. On `localhost` the request ID
still reaches the page, but no identification is recorded. Serve the example from a registered
development domain to see results in the [analytics dashboard](https://app.shieldlabs.ai).

## Build against a local copy of the package

Inside the `shieldlabs-js` repository, before `@shieldlabs-ai/js` is on npm:

```bash
# repository root
npm ci && npm run build && npm pack
cd examples/vite
npm install --no-save --no-package-lock ../../shieldlabs-ai-js-1.0.0.tgz
npm run build
```

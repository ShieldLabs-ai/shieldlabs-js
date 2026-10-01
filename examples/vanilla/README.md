# Script tag example

A signup form without a bundler. It loads the IIFE build of `@shieldlabs-ai/js` (global
`ShieldLabsJS`), starts an identification on the first interaction with the form and posts the
`requestId` to your server in a hidden field.

## Run it

From the repository root:

```bash
npm ci
npm run build
python3 -m http.server 8080
```

Open <http://localhost:8080/examples/vanilla/>. Replace the Public Key in `index.html` with the one
of your domain (Integration > API keys in the [analytics dashboard](https://app.shieldlabs.ai)) and
`/signup` with your endpoint.

After publication, load the script from a public npm CDN instead of `../../dist/`:

```html
<script src="https://cdn.jsdelivr.net/npm/@shieldlabs-ai/js@1.0.0/dist/shieldlabs.iife.js"></script>
```

## Notes

- The page receives only a request ID. Your server reads the Risk Score, risk signals and detection
  flags for it with a ShieldLabs server SDK or the History API.
- ShieldLabs accepts identifications only from registered domains. On `localhost` the request ID
  still reaches the page, but no identification is recorded. Use a registered development domain
  to see results.

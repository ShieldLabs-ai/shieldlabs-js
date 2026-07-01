# @shieldlabs/js

Lightweight browser loader for ShieldLabs. It loads the ShieldLabs agent from the CDN and returns the current identification result (visitor id, device id, and an explainable risk score).

> **Pre-launch.** This package is a placeholder to reserve the name and shape the public API. It is not published yet and the surface will change. Follow along at [shieldlabs.ai](https://shieldlabs.ai).

This package contains **no signal-collection logic**. Collection and scoring happen inside the hosted agent and the ShieldLabs API. The agent is served only from `cdn.shieldlabs.ai`.

## Install

```bash
npm install @shieldlabs/js   # coming soon
```

## Usage (subject to change)

```ts
import { getResult } from "@shieldlabs/js";

const result = await getResult({ apiKey: "pk_live_..." });
// result.visitorId, result.deviceId, result.riskScore, result.requestId
```

## About ShieldLabs

ShieldLabs gives you identification and anonymity detection with an explainable risk score (0-100) and detailed signals, so you can assess traffic quality and act on abuse and fraud in your own code. You read the score and its details; your code owns the decision. You set the rules.

- Website: [shieldlabs.ai](https://shieldlabs.ai)
- Get started: [Start Free](https://shieldlabs.ai)

## License

[MIT](./LICENSE)

# @gennia/sdk

Typed TypeScript client for the [Gennia](https://gennia.ai) Public API, generated from the official OpenAPI spec.

> Status: scaffold. Not yet published to npm.

## Install

```bash
npm install @gennia/sdk
```

## Use

```ts
import { createGenniaClient } from "@gennia/sdk";

const gennia = createGenniaClient({
  apiKey: process.env.GENNIA_API_KEY,
  // baseUrl: "https://api.dev.gennia.ai", // override for dev
});

const { data, error } = await gennia.GET("/public/api/v1/agents", {
  params: { query: { limit: 20 } },
});

if (error) throw new Error(error.message);
console.log(data.items);
```

The client is a thin wrapper around [`openapi-fetch`](https://github.com/openapi-ts/openapi-typescript/tree/main/packages/openapi-fetch); every path, method, parameter and response is fully typed from `openapi.json`.

## Regenerate from spec

```bash
pnpm --filter @gennia/sdk generate
```

To re-vendor the spec from a sibling `gennia-studio-backend` checkout:

```bash
pnpm sync:openapi
```

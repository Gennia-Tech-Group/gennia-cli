# @gennia/mcp

[Model Context Protocol](https://modelcontextprotocol.io) server for the [Gennia](https://gennia.ai) Public API. Every endpoint becomes an MCP tool, so any MCP-capable AI client (Cursor, Claude Code, Claude Desktop, Codex) can talk to your Gennia workspace.

> Status: v0. **132 tools registered**, one per public-API operation. Not yet published to npm.

## Install

Once published you'll just point your AI client at it via `npx`:

```jsonc
// ~/.claude.json
{
  "mcpServers": {
    "gennia": {
      "command": "npx",
      "args": ["-y", "@gennia/mcp"],
      "env": {
        "GENNIA_API_KEY": "gsk_..."
      }
    }
  }
}
```

`gennia mcp install` (from `@gennia/cli`) will write this block for you.

## Environment

| Variable | Default | What it does |
|---|---|---|
| `GENNIA_API_KEY` | — (required) | Workspace API key, sent as `X-Api-Key`. |
| `GENNIA_BASE_URL` | `https://api.gennia.ai` | Override for dev (`https://api.dev.gennia.ai`) or local backend. |

## Transport

Stdio only for now. HTTP transport is a follow-up if a hosted variant makes sense.

## Tool catalog

The server walks the OpenAPI spec at startup (`packages/sdk/openapi.json`, vendored from `gennia-studio-backend`) and registers one MCP tool per operation. Naming is `<tag>__<operationId>` in snake_case (e.g. `agents__list_agents`, `hub__update_identity`, `billing__create_subscription`).

| Tag | Tools |
|---|---|
| `Billing` | 15 |
| `Clients` | 8 |
| `Agent Channels` | 7 |
| `Agents`, `Agent Automations`, `External MCPs`, `HTTP Tools` | 6 each |
| `Agent Commands`, `Agent External MCPs`, `Agent HTTP Tools`, `Agent Native MCPs` | 5 each |
| ... | ... |

Each tool's `inputSchema` is derived from the operation's path/query/header parameters and the `application/json` request body. Schemas referenced via `#/components/schemas/...` are bundled into the tool's `$defs`.

### Not exposed in v1
- `POST /agents/{id}/messages/stream` — SSE streaming. Use the sync `POST /agents/{id}/messages` instead.
- Multipart upload endpoints (`POST /knowledge-sources` with `file_upload`, `POST /skills` ZIP). Use the CLI or the web app for uploads.

## Smoke test

End-to-end verification that the server connects, lists tools, and calls one against the dev API:

```bash
pnpm --filter @gennia/mcp build
GENNIA_API_KEY=gsk_... pnpm --filter @gennia/mcp smoke
```

Expected output:

```
[ok] tools listed: 132 (base=https://api.dev.gennia.ai)
[ok] agents__list_agents returned <N> agents
```

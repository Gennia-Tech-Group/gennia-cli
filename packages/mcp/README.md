# @gennia/mcp

[Model Context Protocol](https://modelcontextprotocol.io) server for the [Gennia](https://gennia.ai) Public API. Every endpoint becomes an MCP tool, so any MCP-capable AI client (Cursor, Claude Code, Claude Desktop, Codex) can talk to your Gennia workspace.

> Status: scaffold. Not yet published to npm. Tool surface is still empty.

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

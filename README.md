# gennia-cli

Developer tooling for the [Gennia](https://gennia.ai) Public API.

This monorepo ships three packages:

| Package | What it is | Latest |
|---|---|---|
| [`@gennia/sdk`](packages/sdk) | Typed TypeScript client generated from the public OpenAPI spec | [`0.2.0`](https://www.npmjs.com/package/@gennia/sdk) |
| [`@gennia/mcp`](packages/mcp) | Model Context Protocol server exposing 132 public-API endpoints as tools | [`0.2.0`](https://www.npmjs.com/package/@gennia/mcp) |
| [`@gennia/cli`](packages/cli) | The `gennia` command — auth, `mcp install`, and raw API escape hatch | [`0.2.0`](https://www.npmjs.com/package/@gennia/cli) |

## Why

The Gennia Public API ([docs](https://docs.gennia.ai)) gives programmatic access to
agents, threads, hubs, billing and more. This repo turns that surface into the
three things developers actually want:

1. A typed SDK they can import.
2. An MCP server they can drop into Cursor, Claude Code, Claude Desktop or Codex.
3. A CLI that automates the boring parts (auth, MCP install, scripted runs).

## Quickstart

```bash
# CLI
npm install -g @gennia/cli
gennia auth login
gennia mcp install        # writes the MCP entry into your local AI client config

# MCP server (zero install)
npx -y @gennia/mcp

# SDK
npm install @gennia/sdk
```

## Development

Requires Node 20+ and pnpm 9+.

```bash
pnpm install
pnpm sync:openapi   # re-vendor the spec from gennia-studio-backend (if checked out next to this repo)
pnpm sdk:generate   # regenerate the typed SDK from the vendored spec
pnpm build
pnpm typecheck
pnpm test
```

## Repo layout

```
gennia-cli/
  packages/
    sdk/        # @gennia/sdk
    mcp/        # @gennia/mcp
    cli/        # @gennia/cli
  scripts/      # workspace tooling (openapi sync, etc.)
```

## Branching

Trunk-based. Feature branches target `main`; releases are git tags (`v0.1.0`, ...).

## License

MIT

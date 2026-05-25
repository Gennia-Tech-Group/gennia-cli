# @gennia/cli

The `gennia` command — install the Gennia MCP server in your AI clients in one shot, and talk to the [Gennia](https://gennia.ai) Public API from your terminal.

```bash
npm install -g @gennia/cli
# or
npx -y @gennia/cli@latest <command>
```

## Quickstart

```bash
$ gennia auth login                   # paste your gsk_... key once
$ gennia mcp install                  # writes config for Claude Code, Cursor, Claude Desktop
$ gennia api GET /agents --limit 5    # raw escape hatch into the API
```

That's it. Your AI clients now know about Gennia.

## Why both an MCP server and a CLI

The two channels are complementary, not competing:

| | `@gennia/mcp` | `@gennia/cli` |
|---|---|---|
| **Best for** | Natural-language chat in Cursor / Claude Desktop / Codex | Scripting, CI, multi-step automation, pipes |
| **Footprint** | 132 tool definitions in every LLM call | Lazy; only what the agent runs |
| **Composability** | Single calls | Pipes, `\| jq`, bash loops |
| **Install** | `gennia mcp install` | `npm install -g @gennia/cli` |

Linear, Stripe, GitHub all ship this dual stack today. Coding agents prefer the CLI for cost; conversational sessions prefer the MCP for affordance.

## Commands

### `gennia auth`

```
gennia auth login                     # paste-key flow; saves to ~/.config/gennia/config.json
gennia auth whoami                    # show workspace bound to current creds
gennia auth logout                    # clear saved credentials
```

`gennia auth login --api-key=gsk_... --json` skips the prompt — friendly for CI.

Credential resolution order: `--api-key` flag → `$GENNIA_API_KEY` → `~/.config/gennia/config.json`.

### `gennia mcp`

```
gennia mcp install [--target=claude-code,cursor,claude-desktop|all|auto] [--dry-run] [--yes] [--update]
gennia mcp uninstall [--target=...]
gennia mcp list                        # show where the MCP is configured + status
gennia mcp status                      # diagnose problems (auth, npx, version, per-client)
```

`install` is idempotent: re-running it on a clean machine writes the config; re-running on a machine that already has the same entry reports `unchanged` and exits 0. If it finds a different entry under the same name, it exits 5 (conflict) — pass `--update` to overwrite.

The install also drops a [`SKILL.md`](https://github.com/Gennia-Tech-Group/gennia-cli/blob/main/packages/cli/skill.md) into the AI client's skill directory (e.g. `~/.claude/skills/gennia/SKILL.md`). That file teaches the agent when to reach for Gennia tools without burning tool-definition tokens.

### `gennia api`

Raw escape hatch into the Public API. Covers every endpoint, including the ones not exposed via MCP (file uploads, streaming).

```bash
gennia api GET /agents --limit 50
gennia api POST /agents --body '{"name":"Test"}'
gennia api POST /agents --body @./payload.json
echo '{"name":"Test"}' | gennia api POST /agents --body -

# Auto-paginate
gennia api GET /agents --all > agents.json

# Pipe into jq / xargs / loops
gennia api GET /agents --all \
  | jq -r '.items[].publicId' \
  | while read id; do
      gennia api PATCH /agents/$id --body '{"categories":["sales"]}'
    done
```

Paths default to `/public/api/v1/<path>`. Absolute URLs (`https://...`) work too.

## Output contract for AI agents

Every command follows the same rules so an agent can script against the CLI:

- **stdout = data**. JSON by default in non-TTY, pretty in TTY (or `--json` to force).
- **stderr = humans**. Banners, progress, hints. Suppressed by `--quiet`.
- **Exit codes**:

  | Code | Meaning |
  |---|---|
  | 0 | success |
  | 1 | generic error / 5xx |
  | 2 | usage error (bad flag, missing TTY for a prompt) |
  | 3 | not found (HTTP 404) |
  | 4 | unauthorized (HTTP 401/403, missing credentials) |
  | 5 | conflict (HTTP 409, existing config) |

- **Errors are always JSON-shaped** with `code`, `message`, `hint`:
  ```json
  {
    "error": {
      "code": "config_conflict",
      "message": "An existing MCP entry differs from what would be installed.",
      "hint": "Re-run with --update to overwrite, or `gennia mcp uninstall` first."
    }
  }
  ```

- **No interactive hangs**. Every command that prompts detects non-TTY and fails fast with a hint to pass the missing flag.

## Environment

| Variable | Default | Effect |
|---|---|---|
| `GENNIA_API_KEY` | — | Workspace API key (`gsk_...`) |
| `GENNIA_BASE_URL` | `https://api.gennia.ai` | Override for dev / local backend |
| `GENNIA_CONFIG_DIR` | `$XDG_CONFIG_HOME/gennia` or `~/.config/gennia` | Where `config.json` lives |
| `NO_COLOR` | unset | Disable ANSI colors |

## License

MIT. See [LICENSE](./LICENSE).

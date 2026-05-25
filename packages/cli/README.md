# @gennia/cli

The `gennia` command — terminal access to the [Gennia](https://gennia.ai) Public API.

> Status: scaffold. Not yet published to npm. Most commands are placeholders.

## Install (once published)

```bash
npm install -g @gennia/cli
# or
npx -y @gennia/cli@latest <command>
```

## Highlights

```bash
gennia auth login                         # OAuth device flow (planned)
gennia auth whoami                        # who am I, which workspace
gennia agents list                        # planned
gennia mcp install                        # write MCP entry into Claude Code / Cursor / Claude Desktop / Codex
```

## Config hierarchy

1. CLI flags (`--api-key`, `--base-url`)
2. Environment (`GENNIA_API_KEY`, `GENNIA_BASE_URL`)
3. `~/.config/gennia/config.json`
4. `gennia auth login` (planned)

## Output

- Pretty in a TTY, `--json` for piping.
- Respects `NO_COLOR`.
- Exit codes: `0` success, `1` runtime error, `2` usage error.

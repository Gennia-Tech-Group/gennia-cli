---
name: gennia
description: Build, query, and automate Gennia agents, hubs, and workspaces via the Public API, the MCP server, or the gennia CLI.
---

# Gennia

[Gennia](https://gennia.ai) is a platform for building **AI agents** and shipping them inside **Hubs** — branded product portals with auth, billing, and conversation history. This skill teaches you how to operate a Gennia workspace from an AI coding session.

## When to use this skill

Trigger this skill when the user mentions any of:

- `gennia`, `gennia studio`, `gennia hub`
- "agent", "hub", "workspace", "knowledge source", "skill" in a context that references Gennia
- "send a message to the agent", "create a hub plan", "list my agents", "invite a client to the hub"
- `@gennia/sdk`, `@gennia/mcp`, `@gennia/cli`

## Two channels, same API

The user has two ways to reach Gennia. **Prefer the right one for the task.**

### 1. MCP tools — `mcp__gennia__*`

Use when:
- One-shot operations in a chat: list / read / create / update a single resource
- The user is conversing naturally ("show my agents", "create a hub plan called Pro")
- You need typed inputSchemas to guide your arguments

132 tools, naming `<tag>__<operation>`:
- `mcp__gennia__agents__list_agents`, `mcp__gennia__agents__create_agent`
- `mcp__gennia__hub__get_hub`, `mcp__gennia__hub__update_identity`
- `mcp__gennia__conversations__list_conversation_messages`
- `mcp__gennia__billing__list_plans`, `mcp__gennia__billing__create_coupon`
- `mcp__gennia__clients__create_client`, `mcp__gennia__clients__suspend_client`

If `mcp__gennia__*` is not in your tool list, the Gennia MCP server is not installed for this session. Suggest:
```
gennia mcp install --target=claude-code
```

### 2. CLI — `gennia` command

Use when:
- The work is scripted / multi-step / piped through other tools
- Token cost matters (CLI is ~40% cheaper than MCP for the same operation)
- The user wants a bash script they can re-run, schedule, or commit
- You need to operate on **many** resources in a loop

```bash
gennia auth whoami                            # confirm credentials
gennia api GET /agents --limit 50             # list (paginated)
gennia api GET /agents --all > agents.json    # dump everything
gennia api POST /agents --body @./payload.json
echo '{"text":"oi"}' | gennia api POST /agents/abc-123/messages --body -
```

If `gennia` is not on PATH, suggest `npm install -g @gennia/cli` or `npx -y @gennia/cli`.

## Resource map (operation → endpoint)

| Domain | Endpoint root | Tools / commands |
|---|---|---|
| Agents | `/public/api/v1/agents` | `agents__*` (6) + per-agent variables/channels/automations/etc. |
| Hub identity | `/public/api/v1/hub` | `hub__get_hub`, `hub__update_identity` |
| Hub clients | `/public/api/v1/clients` | `clients__*` (8) |
| Hub access | `/public/api/v1/hub/access`, `/hub/domain`, `/hub/external-links` | `hub_access__*`, `hub_domain__*`, `hub_external_links__*` |
| Plans + billing | `/public/api/v1/billing/*` | `billing__*` (15) |
| Knowledge | `/public/api/v1/knowledge-sources` | `knowledge_sources__*` (incl. upload via `file_path`) + CLI `gennia knowledge upload` |
| Skills | `/public/api/v1/skills` | `skills__*` (incl. upload via `file_path`) + CLI `gennia skills upload` |
| Conversations | `/public/api/v1/conversations` | `conversations__*`, `messages__send_message` |
| HTTP tools / MCPs / channels (agent-side) | various | `http_tools__*`, `external_mcps__*`, `agent_channels__*` |

## Auth

The user provides a workspace API key (`gsk_…`). Resolution order:
1. `--api-key` flag on the CLI
2. `GENNIA_API_KEY` env var
3. `~/.config/gennia/config.json` (written by `gennia auth login`)

If a Gennia call returns HTTP 401/403:
- Don't retry the same key.
- Tell the user to run `gennia auth login --force` with a fresh key from https://app.gennia.ai/api-keys.

## Common workflows

### "Lista meus agentes"
Use `mcp__gennia__agents__list_agents` (no required args). Returns `{ items, page, total, totalPages }`.

### "Cria um agente chamado X"
Use `mcp__gennia__agents__create_agent` with `{ "name": "X" }`. Returns the new `publicId`. Then optionally call `agents__update_agent` to set categories / description.

### "Manda uma mensagem pro agente Y"
1. `mcp__gennia__conversations__list_conversations` (with `agentPublicId=Y`) to find/pick an existing thread, OR mint a new one.
2. `mcp__gennia__messages__send_message` with the chosen `conversationPublicId`.

### "Dump tudo de bb pra um arquivo"
Use the CLI:
```bash
gennia api GET /agents --all > agents.json
gennia api GET /clients --all > clients.json
```

### "Aplica mudança em bulk em N agentes"
Loop in bash:
```bash
gennia api GET /agents --all \
  | jq -r '.items[].publicId' \
  | while read id; do
      gennia api PATCH /agents/$id --body '{"categories":["sales"]}'
    done
```

## File uploads

Three endpoints take multipart bodies. Both the MCP server and the CLI accept a **local file path** instead of the raw bytes:

| Endpoint | MCP tool | CLI |
|---|---|---|
| `POST /knowledge-sources` | `mcp__gennia__knowledge_sources__upload_file` with `{ file_path, metadata }` | `gennia knowledge upload <file> --metadata '{...}'` |
| `POST /skills` | `mcp__gennia__skills__upload_skill` with `{ file_path }` | `gennia skills upload <file>` |
| `POST /hub/logos/{type}` | `mcp__gennia__hub__upload_logo` with `{ type, file_path }` | `gennia hub upload-logo <file> --type=horizontal\|icon\|email\|banner` |

The MCP server reads the file from the local filesystem of the user's machine (stdio transport runs locally). For a remote MCP this would require a different mechanism, but that's out of scope today.

## Endpoints with caveats

| Endpoint | Caveat |
|---|---|
| `POST /agents/{id}/messages/stream` | Server-Sent Events. Not exposed via MCP. Use the sync `/messages` endpoint, or invoke the URL directly with `curl`. |
| Anything destructive (`DELETE *`, `suspend_client`, `delete_hub_external_links`) | Surface intent to the user; ask for confirmation before calling. |

## Don't

- **Don't paste the user's API key into shell commands you echo back.** Reference it via `$GENNIA_API_KEY` or omit.
- **Don't loop over `agents__list_agents` page-by-page without checking `totalPages`.** Use `gennia api GET /agents --all` if you really need every record.
- **Don't guess field names.** If you're not sure, check the OpenAPI spec at https://docs.gennia.ai/api-reference or call the read variant first to learn the shape.
- **Don't suggest editing `~/.claude.json` by hand.** Use `gennia mcp install` so the merge respects other MCP servers already configured.

## Diagnose problems

```bash
gennia mcp status
```

Prints a checklist: Node version, API reachability, key validity, npx availability, per-client config presence. Use this when a tool call returns `MCP error -32000` or similar.

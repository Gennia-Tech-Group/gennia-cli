#!/usr/bin/env node
/**
 * End-to-end smoke for @gennia/mcp.
 *
 * Spawns the built server (dist/cli.js), connects via the official MCP stdio
 * client, lists every tool, and calls `agents__list_agents` against
 * $GENNIA_BASE_URL (defaults to https://api.dev.gennia.ai).
 *
 * Usage:
 *   pnpm --filter @gennia/mcp build
 *   GENNIA_API_KEY=gsk_... pnpm --filter @gennia/mcp smoke
 */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const apiKey = process.env.GENNIA_API_KEY;
if (!apiKey) {
  console.error("GENNIA_API_KEY is required for the smoke run.");
  process.exit(2);
}

const baseUrl = process.env.GENNIA_BASE_URL ?? "https://api.dev.gennia.ai";

const transport = new StdioClientTransport({
  command: "node",
  args: ["./dist/cli.js"],
  env: { PATH: process.env.PATH ?? "", GENNIA_API_KEY: apiKey, GENNIA_BASE_URL: baseUrl },
});

const client = new Client({ name: "gennia-mcp-smoke", version: "0.0.0" }, { capabilities: {} });
await client.connect(transport);

try {
  const listed = await client.listTools();
  console.log(`[ok] tools listed: ${listed.tools.length} (base=${baseUrl})`);

  const tool = listed.tools.find((t) => t.name === "agents__list_agents");
  if (!tool) throw new Error("agents__list_agents tool missing");

  const result = await client.callTool({
    name: "agents__list_agents",
    arguments: { page: 1, size: 3 },
  });

  if (result.isError) {
    const first = result.content?.[0];
    const text = first?.type === "text" ? first.text : JSON.stringify(first);
    throw new Error(`agents__list_agents call returned isError:\n${text}`);
  }

  const first = result.content?.[0];
  const text = first?.type === "text" ? first.text : "(non-text content)";
  const parsed = JSON.parse(text);
  const count = Array.isArray(parsed?.items) ? parsed.items.length : 0;
  console.log(`[ok] agents__list_agents returned ${count} agents`);
} finally {
  await client.close();
}

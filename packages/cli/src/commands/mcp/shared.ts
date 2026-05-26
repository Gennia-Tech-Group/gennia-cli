import type { McpServerEntry } from "./clients.js";

/** Default name of the MCP server entry written into each client config. */
export const DEFAULT_SERVER_NAME = "gennia";

export interface BuildEntryParams {
  apiKey: string;
  baseUrl: string;
}

/** Canonical `mcpServers.gennia` entry written into every client config. */
export function buildServerEntry(params: BuildEntryParams): McpServerEntry {
  const env: Record<string, string> = { GENNIA_API_KEY: params.apiKey };
  if (params.baseUrl && params.baseUrl !== "https://api.gennia.ai") {
    env.GENNIA_BASE_URL = params.baseUrl;
  }
  return {
    command: "npx",
    args: ["-y", "@gennia/mcp"],
    env,
  };
}

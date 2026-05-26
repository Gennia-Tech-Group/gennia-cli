import { DEFAULT_BASE_URL } from "@gennia/sdk";

export interface GenniaMcpConfig {
  apiKey: string;
  baseUrl: string;
  userAgent: string;
}

export const VERSION = "0.3.1";

export function loadConfig(env: NodeJS.ProcessEnv = process.env): GenniaMcpConfig {
  const apiKey = env.GENNIA_API_KEY ?? "";
  if (!apiKey) {
    throw new Error(
      "GENNIA_API_KEY is required. Set it in the MCP server's `env` block or your shell.",
    );
  }
  const baseUrl = env.GENNIA_BASE_URL ?? DEFAULT_BASE_URL;
  return {
    apiKey,
    baseUrl,
    userAgent: `gennia-mcp/${VERSION} (+${baseUrl})`,
  };
}

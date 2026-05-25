import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { ListToolsRequestSchema, CallToolRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { createGenniaClient, DEFAULT_BASE_URL, type GenniaClient } from "@gennia/sdk";

export interface GenniaMcpConfig {
  apiKey: string;
  baseUrl: string;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): GenniaMcpConfig {
  const apiKey = env.GENNIA_API_KEY ?? "";
  if (!apiKey) {
    throw new Error(
      "GENNIA_API_KEY is required. Set it in the MCP server's `env` block or your shell.",
    );
  }
  return {
    apiKey,
    baseUrl: env.GENNIA_BASE_URL ?? DEFAULT_BASE_URL,
  };
}

export async function runServer(): Promise<void> {
  const config = loadConfig();

  const client: GenniaClient = createGenniaClient({
    apiKey: config.apiKey,
    baseUrl: config.baseUrl,
    userAgent: `gennia-mcp/0.0.0 (+${config.baseUrl})`,
  });

  const server = new Server(
    { name: "gennia-mcp", version: "0.0.0" },
    { capabilities: { tools: {} } },
  );

  // TODO: register one MCP tool per OpenAPI operation. The next iteration will
  // walk `@gennia/sdk/openapi` and emit `<tag>__<operationId>` tools.
  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: [] }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    void client; // referenced once tools are wired
    throw new Error(`Unknown tool: ${request.params.name}`);
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

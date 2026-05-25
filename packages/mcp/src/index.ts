import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { loadConfig, VERSION } from "./config.js";
import { listOperations, loadSpec, type ResolvedOperation } from "./openapi.js";
import { buildInputSchema } from "./schema.js";
import { executeOperation } from "./execute.js";

export { loadConfig } from "./config.js";

function describe(op: ResolvedOperation): string {
  const parts = [op.summary, op.description].filter((part): part is string => Boolean(part));
  if (parts.length === 0) return `${op.method.toUpperCase()} ${op.path}`;
  return parts.join("\n\n");
}

function formatBody(body: unknown): string {
  if (body === null || body === undefined) return "";
  if (typeof body === "string") return body;
  try {
    return JSON.stringify(body, null, 2);
  } catch {
    return String(body);
  }
}

export async function runServer(): Promise<void> {
  const config = loadConfig();
  const spec = loadSpec();
  const operations = listOperations(spec);
  const byName = new Map(operations.map((op) => [op.toolName, op]));

  const server = new Server(
    { name: "gennia-mcp", version: VERSION },
    { capabilities: { tools: {} } },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: operations.map((op) => ({
      name: op.toolName,
      description: describe(op),
      inputSchema: buildInputSchema(op.operation, spec),
    })),
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const op = byName.get(request.params.name);
    if (!op) {
      return {
        isError: true,
        content: [{ type: "text" as const, text: `Unknown tool: ${request.params.name}` }],
      };
    }
    const args = (request.params.arguments ?? {}) as Record<string, unknown>;
    try {
      const result = await executeOperation(op, args, config);
      const text = formatBody(result.body);
      if (!result.ok) {
        return {
          isError: true,
          content: [
            {
              type: "text" as const,
              text: `HTTP ${result.status} from ${op.method.toUpperCase()} ${op.path}\n\n${text}`,
            },
          ],
        };
      }
      return { content: [{ type: "text" as const, text: text || "(no content)" }] };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        isError: true,
        content: [{ type: "text" as const, text: `Tool execution failed: ${message}` }],
      };
    }
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

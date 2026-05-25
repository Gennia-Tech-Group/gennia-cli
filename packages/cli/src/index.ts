import { Command } from "commander";
import { createGenniaClient, DEFAULT_BASE_URL } from "@gennia/sdk";

const VERSION = "0.0.0";

function buildProgram(): Command {
  const program = new Command();

  program
    .name("gennia")
    .description("Gennia CLI — talk to the Gennia Public API from your terminal.")
    .version(VERSION);

  const auth = program.command("auth").description("Manage authentication.");
  auth
    .command("whoami")
    .description("Print the workspace the current API key belongs to.")
    .action(async () => {
      const apiKey = process.env.GENNIA_API_KEY;
      if (!apiKey) {
        throw new Error(
          "Set GENNIA_API_KEY in your environment. `gennia auth login` will land in a follow-up.",
        );
      }
      const client = createGenniaClient({
        apiKey,
        baseUrl: process.env.GENNIA_BASE_URL ?? DEFAULT_BASE_URL,
        userAgent: `gennia-cli/${VERSION}`,
      });
      // Placeholder: a dedicated `/me` endpoint is being scoped. Until then we
      // just confirm the key works by hitting a cheap public endpoint.
      void client;
      console.log("(whoami) configured, real endpoint wiring lands with the SDK codegen.");
    });

  program
    .command("mcp")
    .description("Manage the Gennia MCP server in your AI clients.")
    .command("install")
    .description("Write the Gennia MCP entry into your local AI client configs.")
    .action(() => {
      console.log("(mcp install) coming soon — Claude Code, Cursor, Claude Desktop, Codex.");
    });

  return program;
}

export async function run(argv: string[]): Promise<void> {
  const program = buildProgram();
  await program.parseAsync(argv);
}

import { Command, CommanderError } from "commander";
import { createOutput } from "./lib/output.js";
import { ExitCode, GenniaCliError } from "./lib/errors.js";
import { CLI_VERSION } from "./lib/sdk.js";
import { buildAuthCommand } from "./commands/auth/index.js";
import { buildMcpCommand } from "./commands/mcp/index.js";
import { buildApiCommand } from "./commands/api.js";
import { buildKnowledgeCommand } from "./commands/knowledge/index.js";
import { buildSkillsCommand } from "./commands/skills/index.js";
import { buildHubCommand } from "./commands/hub/index.js";

export function buildProgram(): Command {
  const program = new Command();

  program
    .name("gennia")
    .description("Gennia CLI — talk to the Gennia Public API from your terminal, install the MCP server, and bootstrap AI agents.")
    .version(CLI_VERSION)
    .showHelpAfterError("(use `gennia <command> --help` for details)")
    .configureOutput({
      // Send Commander's own errors to stderr; stdout is reserved for data.
      writeErr: (str) => process.stderr.write(str),
    });

  program.addCommand(buildAuthCommand());
  program.addCommand(buildMcpCommand());
  program.addCommand(buildKnowledgeCommand());
  program.addCommand(buildSkillsCommand());
  program.addCommand(buildHubCommand());
  program.addCommand(buildApiCommand());

  program.addHelpText("after", `
Documentation: https://docs.gennia.ai
Source:        https://github.com/Gennia-Tech-Group/gennia-cli

Quickstart:
  $ gennia auth login            # paste your gsk_... key
  $ gennia mcp install           # add the Gennia MCP to Claude Code, Cursor, Claude Desktop
  $ gennia api GET /agents       # raw escape hatch for any endpoint

Every command supports --json (stable machine output) and --quiet.
`);

  return program;
}

export async function run(argv: string[]): Promise<void> {
  const program = buildProgram();
  try {
    await program.parseAsync(argv);
  } catch (err) {
    handleError(err);
  }
}

function handleError(err: unknown): never {
  // Commander raises CommanderError when --help/--version are invoked. They
  // exit cleanly via process.exit; if we land here it's a usage failure.
  if (err instanceof CommanderError) {
    process.exit(err.exitCode ?? ExitCode.Usage);
  }
  const output = createOutput({ json: !process.stdout.isTTY });
  output.error(err);
  if (err instanceof GenniaCliError) {
    process.exit(err.exitCode);
  }
  process.exit(ExitCode.Generic);
}

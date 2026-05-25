import { Command } from "commander";
import { buildInstallCommand } from "./install.js";
import { buildUninstallCommand } from "./uninstall.js";
import { buildListCommand } from "./list.js";
import { buildStatusCommand } from "./status.js";

export function buildMcpCommand(): Command {
  return new Command("mcp")
    .description("Install and manage the Gennia MCP server in your AI clients.")
    .addCommand(buildInstallCommand())
    .addCommand(buildUninstallCommand())
    .addCommand(buildListCommand())
    .addCommand(buildStatusCommand());
}

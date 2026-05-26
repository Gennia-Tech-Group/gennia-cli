import { Command } from "commander";
import { rmSync } from "node:fs";
import { createOutput } from "../../lib/output.js";
import { isInteractive, promptConfirm } from "../../lib/tty.js";
import {
  ALL_CLIENT_IDS,
  describeClients,
  parseTargets,
  readClientConfig,
  removeMcpServer,
  writeClientConfig,
  type ClientId,
} from "./clients.js";
import { DEFAULT_SERVER_NAME } from "./shared.js";

interface UninstallResult {
  target: ClientId;
  configPath: string;
  status: "removed" | "absent" | "config_missing";
  skillRemoved?: string;
}

export function buildUninstallCommand(): Command {
  return new Command("uninstall")
    .description("Remove the Gennia MCP server entry from your AI clients.")
    .option("--target <list>", "Comma list (claude-code,cursor,claude-desktop), or `all`", "all")
    .option("--name <name>", "Server name to remove", DEFAULT_SERVER_NAME)
    .option("--keep-skill", "Leave the bundled skill file in place even after removing the MCP entry")
    .option("--dry-run", "Print what would change without writing")
    .option("-y, --yes", "Skip the interactive confirmation prompt")
    .option("--json", "Emit structured JSON output to stdout")
    .option("--quiet", "Suppress all human-readable output")
    .addHelpText("after", `
Examples:
  $ gennia mcp uninstall                            # remove from every supported client
  $ gennia mcp uninstall --target=claude-code --yes
  $ gennia mcp uninstall --dry-run --json
`)
    .action(async (opts: {
      target: string;
      name: string;
      keepSkill?: boolean;
      dryRun?: boolean;
      yes?: boolean;
      json?: boolean;
      quiet?: boolean;
    }) => {
      const output = createOutput(opts);
      const parsed = parseTargets(opts.target);
      const targets: ClientId[] = parsed === "auto" || parsed === "all"
        ? [...ALL_CLIENT_IDS]
        : parsed;
      const clients = describeClients().filter((c) => targets.includes(c.id));

      if (!opts.yes && !opts.dryRun && !opts.json && isInteractive()) {
        const list = clients.map((c) => c.displayName).join(", ");
        const ok = await promptConfirm(`Remove Gennia MCP from ${list}?`, true);
        if (!ok) {
          output.info("Cancelled.");
          return;
        }
      }

      const results: UninstallResult[] = [];
      for (const client of clients) {
        const file = readClientConfig(client.configPath);
        if (!file.existed) {
          results.push({ target: client.id, configPath: client.configPath, status: "config_missing" });
          continue;
        }
        const { next, removed } = removeMcpServer(file.data, opts.name);
        if (!removed) {
          results.push({ target: client.id, configPath: client.configPath, status: "absent" });
          continue;
        }
        if (!opts.dryRun) {
          writeClientConfig(client.configPath, next);
        }
        let skillRemoved: string | undefined;
        if (!opts.dryRun && !opts.keepSkill && client.skillPath) {
          try {
            rmSync(client.skillPath, { force: true });
            skillRemoved = client.skillPath;
          } catch {
            // Best effort; never fail uninstall on skill removal.
          }
        }
        results.push({ target: client.id, configPath: client.configPath, status: "removed", skillRemoved });
      }

      for (const r of results) {
        const verb = ({
          removed: "Removed   ",
          absent: "Not present",
          config_missing: "Config absent",
        } as const)[r.status];
        const client = clients.find((c) => c.id === r.target);
        output.info(`${verb}  ${(client?.displayName ?? r.target).padEnd(16)} ${r.configPath}`);
      }
      output.data({ target: targets, dryRun: opts.dryRun ?? false, results }, () => "");
    });
}

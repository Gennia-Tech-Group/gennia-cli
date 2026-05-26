import { Command } from "commander";
import pc from "picocolors";
import { createOutput } from "../../lib/output.js";
import {
  describeClients,
  getMcpServers,
  readClientConfig,
  entriesEqual,
  type ClientId,
} from "./clients.js";
import { DEFAULT_SERVER_NAME, buildServerEntry } from "./shared.js";

interface ListEntry {
  target: ClientId;
  displayName: string;
  configPath: string;
  configExists: boolean;
  installed: boolean;
  serverName: string;
  matchesCurrent?: boolean;
  command?: string;
  args?: string[];
  hasApiKey?: boolean;
  baseUrl?: string | null;
}

export function buildListCommand(): Command {
  return new Command("list")
    .description("Show where the Gennia MCP server is configured across your AI clients.")
    .option("--name <name>", "Server name to look for", DEFAULT_SERVER_NAME)
    .option("--json", "Emit structured JSON output to stdout")
    .option("--quiet", "Suppress all human-readable output")
    .addHelpText("after", `
Examples:
  $ gennia mcp list
  $ gennia mcp list --json | jq '.[].installed'
`)
    .action((opts: { name: string; json?: boolean; quiet?: boolean }) => {
      const output = createOutput(opts);
      const clients = describeClients();

      const expected = buildServerEntry({
        apiKey: "REDACTED",
        baseUrl: "https://api.gennia.ai",
      });

      const entries: ListEntry[] = clients.map((client) => {
        const file = readClientConfig(client.configPath);
        const servers = getMcpServers(file.data);
        const entry = servers[opts.name];
        const baseEntry: ListEntry = {
          target: client.id,
          displayName: client.displayName,
          configPath: client.configPath,
          configExists: file.existed,
          installed: Boolean(entry),
          serverName: opts.name,
        };
        if (entry) {
          return {
            ...baseEntry,
            matchesCurrent: entriesEqual(
              entry,
              { ...expected, env: { ...(expected.env ?? {}), ...(entry.env ?? {}) } },
            ),
            command: entry.command,
            args: entry.args,
            hasApiKey: Boolean(entry.env?.GENNIA_API_KEY),
            baseUrl: entry.env?.GENNIA_BASE_URL ?? null,
          };
        }
        return baseEntry;
      });

      output.data(entries, (value) => {
        const rows = value as ListEntry[];
        return rows
          .map((r) => {
            const status = r.installed
              ? pc.green("installed")
              : r.configExists
                ? pc.dim("not installed")
                : pc.dim("(config not present)");
            return [
              `${pc.bold(r.displayName)}  ${status}`,
              `  ${pc.dim("path")}      ${r.configPath}`,
              r.installed ? `  ${pc.dim("command")}   ${r.command} ${(r.args ?? []).join(" ")}` : "",
              r.installed ? `  ${pc.dim("env")}       GENNIA_API_KEY=${r.hasApiKey ? "set" : "missing"}` : "",
              r.installed && r.baseUrl ? `  ${pc.dim("base url")}  ${r.baseUrl}` : "",
            ]
              .filter(Boolean)
              .join("\n");
          })
          .join("\n\n");
      });
    });
}

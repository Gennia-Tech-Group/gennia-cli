import { Command } from "commander";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import { createOutput } from "../../lib/output.js";
import { resolveAuth } from "../../lib/auth.js";
import { ExitCode, GenniaCliError } from "../../lib/errors.js";
import { isInteractive, promptConfirm } from "../../lib/tty.js";
import {
  ALL_CLIENT_IDS,
  describeClients,
  entriesEqual,
  getMcpServers,
  parseTargets,
  readClientConfig,
  setMcpServer,
  writeClientConfig,
  type ClientDescriptor,
  type ClientId,
  type McpServerEntry,
} from "./clients.js";
import { DEFAULT_SERVER_NAME, buildServerEntry } from "./shared.js";

interface InstallResult {
  target: ClientId;
  configPath: string;
  status: "installed" | "updated" | "unchanged" | "skipped_conflict";
  reason?: string;
  skillWritten?: string;
}

export function buildInstallCommand(): Command {
  return new Command("install")
    .description("Write the Gennia MCP server entry into your AI clients.")
    .option("--target <list>", "Comma list (claude-code,cursor,claude-desktop), or `all`, or `auto` (detect installed)", "auto")
    .option("--name <name>", "Server name written into the client config", DEFAULT_SERVER_NAME)
    .option("--api-key <key>", "Override saved/env API key for this install")
    .option("--base-url <url>", "Override the API base URL")
    .option("--update", "Overwrite an existing entry whose config differs")
    .option("--no-skill", "Skip writing the Gennia skill file alongside the MCP entry")
    .option("--dry-run", "Print what would change without writing")
    .option("-y, --yes", "Skip the interactive confirmation prompt")
    .option("--json", "Emit structured JSON output to stdout")
    .option("--quiet", "Suppress all human-readable output")
    .addHelpText("after", `
Examples:
  # Interactive: install into every detected AI client
  $ gennia auth login
  $ gennia mcp install

  # Non-interactive: agents/scripts/CI
  $ gennia mcp install --target=claude-code,cursor --yes --json

  # Dev environment, ad-hoc API key
  $ gennia mcp install --api-key=gsk_... --base-url=https://api.dev.gennia.ai --yes

  # Preview without changing files
  $ gennia mcp install --dry-run

Exit codes: 0 success, 2 usage/no TTY, 4 unauthorized, 5 conflict (use --update).
`)
    .action(async (opts: {
      target: string;
      name: string;
      apiKey?: string;
      baseUrl?: string;
      update?: boolean;
      skill?: boolean;
      dryRun?: boolean;
      yes?: boolean;
      json?: boolean;
      quiet?: boolean;
    }) => {
      const output = createOutput(opts);
      const auth = resolveAuth(opts);
      const entry = buildServerEntry({ apiKey: auth.apiKey, baseUrl: auth.baseUrl });

      const targets = await resolveTargets(opts.target, opts.yes ?? false);

      const clients = describeClients();
      const planned = clients.filter((c) => targets.includes(c.id));

      if (planned.length === 0) {
        throw new GenniaCliError({
          code: "no_targets",
          message: "No matching AI clients to install into.",
          exitCode: ExitCode.Usage,
          hint: "Pass --target=claude-code,cursor,claude-desktop or install one of those tools first.",
        });
      }

      if (!opts.yes && !opts.dryRun && !opts.json && isInteractive()) {
        const list = planned.map((c) => c.displayName).join(", ");
        const ok = await promptConfirm(`Install Gennia MCP into ${list}?`, true);
        if (!ok) {
          output.info("Cancelled.");
          return;
        }
      }

      const results: InstallResult[] = [];
      const includeSkill = opts.skill !== false;
      const skillBody = includeSkill ? readBundledSkill() : null;

      for (const client of planned) {
        const result = applyToClient({
          client,
          name: opts.name,
          entry,
          update: opts.update ?? false,
          dryRun: opts.dryRun ?? false,
          skillBody,
        });
        results.push(result);
        if (!opts.json && !opts.quiet) {
          renderHumanResult(output, result, client);
        }
      }

      const hasConflict = results.some((r) => r.status === "skipped_conflict");
      output.data(
        { target: targets, name: opts.name, dryRun: opts.dryRun ?? false, results },
        () => "",
      );
      if (hasConflict && !opts.update) {
        throw new GenniaCliError({
          code: "config_conflict",
          message: "An existing MCP entry differs from what would be installed.",
          exitCode: ExitCode.Conflict,
          hint: "Re-run with --update to overwrite, or `gennia mcp uninstall` first.",
        });
      }
      if (!opts.dryRun) {
        output.success(
          planned.length === 1
            ? `Restart ${planned[0]?.displayName ?? ""} to load the Gennia MCP server.`
            : "Restart your AI clients to load the Gennia MCP server.",
        );
      }
    });
}

async function resolveTargets(raw: string, yes: boolean): Promise<ClientId[]> {
  const parsed = parseTargets(raw);
  if (parsed === "all") return [...ALL_CLIENT_IDS];

  const clients = describeClients();
  const detectedIds = clients.filter((c) => readClientConfig(c.configPath).existed).map((c) => c.id);

  if (parsed === "auto") {
    if (detectedIds.length === 0) {
      // No clients detected — fall back to installing into all of them so the
      // user gets the config even before they launch the app for the first time.
      if (!yes && isInteractive()) {
        const ok = await promptConfirm(
          "No AI client config files found yet. Install into all supported clients?",
          true,
        );
        if (!ok) return [];
      }
      return [...ALL_CLIENT_IDS];
    }
    return detectedIds;
  }

  return parsed;
}

interface ApplyParams {
  client: ClientDescriptor;
  name: string;
  entry: McpServerEntry;
  update: boolean;
  dryRun: boolean;
  skillBody: string | null;
}

function applyToClient(params: ApplyParams): InstallResult {
  const { client, name, entry, update, dryRun, skillBody } = params;
  const file = readClientConfig(client.configPath);
  const existing = getMcpServers(file.data)[name];

  let status: InstallResult["status"];
  if (entriesEqual(existing, entry)) {
    status = "unchanged";
  } else if (existing && !update) {
    return {
      target: client.id,
      configPath: client.configPath,
      status: "skipped_conflict",
      reason: "An entry with this name already exists with different settings.",
    };
  } else {
    status = existing ? "updated" : "installed";
  }

  if (!dryRun && status !== "unchanged") {
    writeClientConfig(client.configPath, setMcpServer(file.data, name, entry));
  }

  let skillWritten: string | undefined;
  if (!dryRun && skillBody && client.skillPath) {
    try {
      mkdirSync(dirname(client.skillPath), { recursive: true });
      writeFileSync(client.skillPath, skillBody, "utf8");
      skillWritten = client.skillPath;
    } catch {
      // Skill is a nice-to-have; never fail the install on a write error.
    }
  }

  return { target: client.id, configPath: client.configPath, status, skillWritten };
}

function renderHumanResult(
  output: ReturnType<typeof createOutput>,
  result: InstallResult,
  client: ClientDescriptor,
): void {
  const verb = ({
    installed: "Installed",
    updated: "Updated",
    unchanged: "Already up to date",
    skipped_conflict: "Skipped (conflict)",
  } as const)[result.status];
  output.info(`${verb}  ${client.displayName.padEnd(16)} ${result.configPath}`);
  if (result.skillWritten) {
    output.info(`  skill -> ${result.skillWritten}`);
  }
  if (result.reason) {
    output.info(`  ${result.reason}`);
  }
}

let cachedSkillBody: string | null = null;
function readBundledSkill(): string {
  if (cachedSkillBody !== null) return cachedSkillBody;
  const here = dirname(fileURLToPath(import.meta.url));
  // After build/publish, this file lives at:
  //   node_modules/@gennia/cli/dist/commands/mcp/install.js
  // and skill.md sits at:
  //   node_modules/@gennia/cli/skill.md
  // (three levels up). During local dev with tsx, the structure is the same
  // since src/ mirrors dist/.
  const candidates = [
    resolve(here, "../../../skill.md"),
    resolve(here, "../../skill.md"),
    resolve(here, "../skill.md"),
  ];
  for (const path of candidates) {
    try {
      const body = readFileSync(path, "utf8");
      cachedSkillBody = body;
      return body;
    } catch {
      // try next
    }
  }
  cachedSkillBody = "";
  return "";
}

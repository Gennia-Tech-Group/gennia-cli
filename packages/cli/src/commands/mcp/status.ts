import { Command } from "commander";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import pc from "picocolors";
import { DEFAULT_BASE_URL } from "@gennia/sdk";
import { createOutput } from "../../lib/output.js";
import { resolveAuth } from "../../lib/auth.js";
import { healthCheck } from "../auth/shared.js";
import {
  describeClients,
  getMcpServers,
  readClientConfig,
} from "./clients.js";
import { DEFAULT_SERVER_NAME } from "./shared.js";
import { CLI_VERSION } from "../../lib/sdk.js";

interface CheckResult {
  name: string;
  ok: boolean;
  detail: string;
}

export function buildStatusCommand(): Command {
  return new Command("status")
    .description("Diagnose problems with the Gennia MCP setup on this machine.")
    .option("--name <name>", "Server name to look for", DEFAULT_SERVER_NAME)
    .option("--api-key <key>", "Override the API key for the health probe")
    .option("--base-url <url>", "Override the API base URL", DEFAULT_BASE_URL)
    .option("--json", "Emit structured JSON output to stdout")
    .option("--quiet", "Suppress all human-readable output")
    .addHelpText("after", `
Run this when an AI client says "MCP failed to connect" or when you bumped
@gennia/mcp and want to make sure the new version is reachable.

Examples:
  $ gennia mcp status
  $ gennia mcp status --json
`)
    .action(async (opts: {
      name: string;
      apiKey?: string;
      baseUrl?: string;
      json?: boolean;
      quiet?: boolean;
    }) => {
      const output = createOutput(opts);
      const auth = resolveAuth(opts);
      const checks: CheckResult[] = [];

      // 1. Node version
      const nodeVersion = process.version;
      const major = parseInt(nodeVersion.replace(/^v/, "").split(".")[0] ?? "0", 10);
      checks.push({
        name: "Node version",
        ok: major >= 20,
        detail: `${nodeVersion} (require >= 20)`,
      });

      // 2. Auth via /health
      try {
        const identity = await healthCheck(auth);
        checks.push({
          name: "API reachable + key valid",
          ok: true,
          detail: `workspace ${identity.workspacePublicId}`,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        checks.push({ name: "API reachable + key valid", ok: false, detail: message });
      }

      // 3. Latest npm version vs configured
      const latest = await fetchLatestVersion("@gennia/mcp");
      checks.push({
        name: "Latest @gennia/mcp on npm",
        ok: latest !== null,
        detail: latest ? latest : "could not reach https://registry.npmjs.org",
      });

      // 4. Per-client config presence
      const clients = describeClients();
      for (const client of clients) {
        const file = readClientConfig(client.configPath);
        if (!file.existed) {
          checks.push({
            name: `${client.displayName} config`,
            ok: true,
            detail: "not installed (skipped)",
          });
          continue;
        }
        const entry = getMcpServers(file.data)[opts.name];
        if (!entry) {
          checks.push({
            name: `${client.displayName} MCP entry`,
            ok: false,
            detail: `mcpServers.${opts.name} missing — run \`gennia mcp install --target=${client.id}\``,
          });
          continue;
        }
        const hasKey = Boolean(entry.env?.GENNIA_API_KEY);
        checks.push({
          name: `${client.displayName} MCP entry`,
          ok: hasKey,
          detail: hasKey ? "configured" : "GENNIA_API_KEY missing in env",
        });
      }

      // 5. `npx` reachable in PATH (best-effort)
      checks.push({
        name: "`npx` on PATH",
        ok: await npxReachable(),
        detail: "needed because the MCP servers spawn via `npx -y @gennia/mcp`",
      });

      // 6. Skill file present (only relevant if Claude Code is in the picture)
      const claudeCode = clients.find((c) => c.id === "claude-code");
      if (claudeCode?.skillPath) {
        checks.push({
          name: "Claude Code skill file",
          ok: existsSync(claudeCode.skillPath),
          detail: claudeCode.skillPath,
        });
      }

      const failures = checks.filter((c) => !c.ok);
      output.data({ checks, failures, cliVersion: CLI_VERSION }, (value) => {
        const ck = (value as { checks: CheckResult[]; cliVersion: string }).checks;
        const lines = ck.map((c) => {
          const mark = c.ok ? pc.green("✓") : pc.red("✗");
          return `  ${mark} ${c.name.padEnd(34)} ${pc.dim(c.detail)}`;
        });
        const head = `gennia mcp status (cli v${CLI_VERSION})`;
        return [pc.bold(head), ...lines].join("\n");
      });

      if (failures.length > 0) {
        process.exitCode = 1;
      }
    });
}

async function fetchLatestVersion(pkg: string): Promise<string | null> {
  try {
    const r = await fetch(`https://registry.npmjs.org/${encodeURIComponent(pkg)}/latest`);
    if (!r.ok) return null;
    const body = (await r.json()) as { version?: string };
    return body.version ?? null;
  } catch {
    return null;
  }
}

function npxReachable(): Promise<boolean> {
  return new Promise((resolve_) => {
    const proc = spawn("npx", ["--version"], { stdio: "ignore" });
    proc.on("error", () => resolve_(false));
    proc.on("exit", (code) => resolve_(code === 0));
  });
}

import { Command } from "commander";
import { DEFAULT_BASE_URL } from "@gennia/sdk";
import { createOutput } from "../../lib/output.js";
import { GenniaCliError, ExitCode } from "../../lib/errors.js";
import { saveConfig, loadConfig } from "../../lib/config.js";
import { promptLine } from "../../lib/tty.js";
import { healthCheck } from "./shared.js";

export function buildLoginCommand(): Command {
  return new Command("login")
    .description("Save credentials so the CLI can talk to your Gennia workspace.")
    .option("--api-key <key>", "API key (gsk_...); skip the interactive prompt")
    .option("--base-url <url>", "API base URL", DEFAULT_BASE_URL)
    .option("--force", "Overwrite existing credentials without confirmation")
    .option("--json", "Emit structured JSON output to stdout")
    .option("--quiet", "Suppress all human-readable output")
    .addHelpText("after", `
The CLI talks to the **production** API by default (https://api.gennia.ai).
If your key was generated in a non-prod workspace (dev, local), pass
--base-url so the key validates against the right environment:

  $ gennia auth login --base-url=https://api.dev.gennia.ai
  $ gennia auth login --base-url=http://localhost:8080

Generate a key inside Studio: open your workspace, then Settings → API Keys
(it's a modal; the value is shown once — copy it before closing).

Examples:
  # Interactive (paste the key when prompted; the real value is never echoed)
  $ gennia auth login

  # Non-interactive (agents, scripts, CI)
  $ gennia auth login --api-key=gsk_... --json

  # Point at the dev environment
  $ gennia auth login --base-url=https://api.dev.gennia.ai
`)
    .action(async (opts: {
      apiKey?: string;
      baseUrl?: string;
      force?: boolean;
      json?: boolean;
      quiet?: boolean;
    }) => {
      const output = createOutput(opts);
      const baseUrl = opts.baseUrl ?? DEFAULT_BASE_URL;

      const existing = loadConfig();
      if (existing.apiKey && !opts.force) {
        throw new GenniaCliError({
          code: "already_authenticated",
          message: `Already logged in (workspace ${existing.workspacePublicId ?? "unknown"}).`,
          exitCode: ExitCode.Conflict,
          hint: "Run `gennia auth logout` first, or pass --force to overwrite.",
          context: { workspacePublicId: existing.workspacePublicId },
        });
      }

      const apiKey = opts.apiKey
        ?? await promptLine("Paste your Gennia API key (gsk_...):", { mask: true });

      if (!/^gsk_[A-Za-z0-9_-]{10,}$/.test(apiKey)) {
        throw new GenniaCliError({
          code: "invalid_api_key",
          message: "API key doesn't look like a Gennia workspace key.",
          exitCode: ExitCode.Usage,
          hint: "Workspace keys start with `gsk_`. Generate one inside Studio: open your workspace, then Settings → API Keys.",
        });
      }

      output.info(`Validating against ${baseUrl}…`);
      const identity = await healthCheck({ apiKey, baseUrl });

      saveConfig({
        apiKey,
        baseUrl,
        workspacePublicId: identity.workspacePublicId,
        apiKeyPublicId: identity.apiKeyPublicId,
      });

      output.success(
        `Logged in to workspace ${identity.workspacePublicId} (api key ${identity.apiKeyPublicId}).`,
      );
      output.data(
        {
          status: "logged_in",
          workspacePublicId: identity.workspacePublicId,
          apiKeyPublicId: identity.apiKeyPublicId,
          baseUrl,
        },
        () => `Saved credentials to ~/.config/gennia/config.json`,
      );
    });
}

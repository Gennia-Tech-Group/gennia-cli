import { Command } from "commander";
import pc from "picocolors";
import { createOutput } from "../../lib/output.js";
import { resolveAuth } from "../../lib/auth.js";
import { healthCheck } from "./shared.js";

export function buildWhoamiCommand(): Command {
  return new Command("whoami")
    .description("Show the workspace bound to the current credentials.")
    .option("--api-key <key>", "Override the saved/env API key")
    .option("--base-url <url>", "Override the saved/env base URL")
    .option("--json", "Emit structured JSON output to stdout")
    .option("--quiet", "Suppress all human-readable output")
    .addHelpText("after", `
Examples:
  $ gennia auth whoami
  $ gennia auth whoami --json
  $ GENNIA_API_KEY=gsk_... gennia auth whoami
`)
    .action(async (opts: {
      apiKey?: string;
      baseUrl?: string;
      json?: boolean;
      quiet?: boolean;
    }) => {
      const output = createOutput(opts);
      const auth = resolveAuth(opts);
      const identity = await healthCheck(auth);

      output.data(
        {
          status: identity.status,
          workspacePublicId: identity.workspacePublicId,
          apiKeyPublicId: identity.apiKeyPublicId,
          baseUrl: auth.baseUrl,
          credentialSource: auth.source,
        },
        () => {
          const lines = [
            `Workspace:        ${pc.cyan(identity.workspacePublicId)}`,
            `API key:          ${pc.dim(identity.apiKeyPublicId)}`,
            `Base URL:         ${pc.dim(auth.baseUrl)}`,
            `Credential from:  ${pc.dim(auth.source)}`,
          ];
          return lines.join("\n");
        },
      );
    });
}

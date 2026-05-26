import { Command } from "commander";
import pc from "picocolors";
import { createOutput } from "../../lib/output.js";
import { resolveAuth } from "../../lib/auth.js";
import { genniaBlue } from "../../lib/banner.js";
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
          // "API key ID" not "API key" — this is the public identifier of the
          // key (UUID), not the secret `gsk_...`. The secret never leaves
          // ~/.config/gennia/config.json (mode 0600).
          const lines = [
            `Workspace:        ${genniaBlue(identity.workspacePublicId)}`,
            `API key ID:       ${pc.dim(identity.apiKeyPublicId)}`,
            `Base URL:         ${pc.dim(auth.baseUrl)}`,
            `Credential from:  ${pc.dim(auth.source)}`,
          ];
          return lines.join("\n");
        },
      );
    });
}

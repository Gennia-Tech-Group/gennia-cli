import { Command } from "commander";
import { createOutput } from "../../lib/output.js";
import { clearConfig, loadConfig } from "../../lib/config.js";

export function buildLogoutCommand(): Command {
  return new Command("logout")
    .description("Forget saved Gennia credentials on this machine.")
    .option("--json", "Emit structured JSON output to stdout")
    .option("--quiet", "Suppress all human-readable output")
    .addHelpText("after", `
Examples:
  $ gennia auth logout
  $ gennia auth logout --json
`)
    .action((opts: { json?: boolean; quiet?: boolean }) => {
      const output = createOutput(opts);
      const before = loadConfig();
      if (!before.apiKey) {
        output.info("Not logged in; nothing to do.");
        output.data({ status: "already_logged_out" });
        return;
      }
      clearConfig();
      output.success("Credentials cleared.");
      output.data({
        status: "logged_out",
        workspacePublicId: before.workspacePublicId,
      });
    });
}

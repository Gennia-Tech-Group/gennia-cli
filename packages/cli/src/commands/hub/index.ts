import { Command } from "commander";
import { buildHubUploadLogoCommand } from "./upload-logo.js";

export function buildHubCommand(): Command {
  return new Command("hub")
    .description("Operate on the workspace's Hub (identity, logos, etc.).")
    .addCommand(buildHubUploadLogoCommand());
}

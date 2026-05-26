import { Command } from "commander";
import { buildLoginCommand } from "./login.js";
import { buildLogoutCommand } from "./logout.js";
import { buildWhoamiCommand } from "./whoami.js";

export function buildAuthCommand(): Command {
  return new Command("auth")
    .description("Manage Gennia credentials on this machine.")
    .addCommand(buildLoginCommand())
    .addCommand(buildLogoutCommand())
    .addCommand(buildWhoamiCommand());
}

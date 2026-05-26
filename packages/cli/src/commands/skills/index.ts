import { Command } from "commander";
import { buildSkillsUploadCommand } from "./upload.js";

export function buildSkillsCommand(): Command {
  return new Command("skills")
    .description("Manage skills available to your agents.")
    .addCommand(buildSkillsUploadCommand());
}

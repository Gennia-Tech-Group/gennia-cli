import { Command } from "commander";
import { buildKnowledgeUploadCommand } from "./upload.js";

export function buildKnowledgeCommand(): Command {
  return new Command("knowledge")
    .description("Manage knowledge sources (file uploads, document indexing).")
    .addCommand(buildKnowledgeUploadCommand());
}

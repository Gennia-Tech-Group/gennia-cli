import { Command } from "commander";
import { existsSync } from "node:fs";
import { uploadFile } from "@gennia/sdk";
import { createOutput } from "../../lib/output.js";
import { resolveAuth } from "../../lib/auth.js";
import { ExitCode, GenniaCliError, type ExitCodeValue } from "../../lib/errors.js";
import { CLI_VERSION } from "../../lib/sdk.js";

const ALLOWED_EXTS = new Set([".zip", ".skill", ".md"]);

export function buildSkillsUploadCommand(): Command {
  return new Command("upload")
    .description("Upload a skill bundle (.zip), .skill archive, or a standalone SKILL.md.")
    .argument("<file>", "Path to the local skill file")
    .option("--api-key <key>", "Override saved/env API key")
    .option("--base-url <url>", "Override the API base URL")
    .option("--json", "Emit structured JSON output to stdout")
    .option("--quiet", "Suppress all human-readable output")
    .addHelpText("after", `
Examples:
  $ gennia skills upload ./my-skill.zip
  $ gennia skills upload ./SKILL.md

Frontmatter (\`name\`, \`description\`, \`license\`, \`compatibility\`, \`metadata\`)
is read by the server from the file itself.
`)
    .action(async (filePath: string, opts: {
      apiKey?: string;
      baseUrl?: string;
      json?: boolean;
      quiet?: boolean;
    }) => {
      const output = createOutput(opts);
      if (!existsSync(filePath)) {
        throw new GenniaCliError({
          code: "file_not_found",
          message: `File does not exist: ${filePath}`,
          exitCode: ExitCode.Usage,
        });
      }
      const lower = filePath.toLowerCase();
      const ext = lower.slice(lower.lastIndexOf("."));
      if (!ALLOWED_EXTS.has(ext)) {
        throw new GenniaCliError({
          code: "unsupported_extension",
          message: `File extension ${ext} is not supported.`,
          exitCode: ExitCode.Usage,
          hint: `Allowed: ${[...ALLOWED_EXTS].join(", ")}.`,
        });
      }

      const auth = resolveAuth(opts);
      output.info(`Uploading ${filePath} to ${auth.baseUrl}…`);
      const result = await uploadFile({
        apiKey: auth.apiKey,
        baseUrl: auth.baseUrl,
        path: "/skills",
        filePath,
        userAgent: `gennia-cli/${CLI_VERSION}`,
      });
      assertUploadOk(result);
      output.success("Skill uploaded.");
      output.data(result.body);
    });
}

function assertUploadOk(result: { ok: boolean; status: number; body: unknown }): void {
  if (result.ok) return;
  const message = (result.body && typeof result.body === "object" && "message" in (result.body as Record<string, unknown>)
    ? String((result.body as Record<string, unknown>).message)
    : null) ?? `Upload failed with HTTP ${result.status}.`;
  const code = (result.body && typeof result.body === "object" && "code" in (result.body as Record<string, unknown>)
    ? String((result.body as Record<string, unknown>).code)
    : null) ?? `http_${result.status}`;
  throw new GenniaCliError({
    code,
    message,
    exitCode: statusToExitCode(result.status),
    context: { status: result.status, body: result.body },
  });
}

function statusToExitCode(status: number): ExitCodeValue {
  if (status === 404) return ExitCode.NotFound;
  if (status === 401 || status === 403) return ExitCode.Unauthorized;
  if (status === 409) return ExitCode.Conflict;
  if (status >= 400 && status < 500) return ExitCode.Usage;
  return ExitCode.Generic;
}

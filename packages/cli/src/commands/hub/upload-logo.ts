import { Command } from "commander";
import { existsSync } from "node:fs";
import { uploadFile } from "@gennia/sdk";
import { createOutput } from "../../lib/output.js";
import { resolveAuth } from "../../lib/auth.js";
import { ExitCode, GenniaCliError, type ExitCodeValue } from "../../lib/errors.js";
import { CLI_VERSION } from "../../lib/sdk.js";

const LOGO_TYPES = ["horizontal", "icon", "email", "banner"] as const;
type LogoType = (typeof LOGO_TYPES)[number];

const ALLOWED_EXTS = new Set([".png", ".jpg", ".jpeg", ".webp", ".svg"]);

export function buildHubUploadLogoCommand(): Command {
  return new Command("upload-logo")
    .description("Replace one of the hub's logo variants (horizontal, icon, email, banner).")
    .argument("<file>", "Path to the image file")
    .requiredOption("--type <variant>", `Logo variant: ${LOGO_TYPES.join(", ")}`)
    .option("--api-key <key>", "Override saved/env API key")
    .option("--base-url <url>", "Override the API base URL")
    .option("--json", "Emit structured JSON output to stdout")
    .option("--quiet", "Suppress all human-readable output")
    .addHelpText("after", `
Examples:
  $ gennia hub upload-logo ./logo.png --type=horizontal
  $ gennia hub upload-logo ./icon.svg --type=icon
  $ gennia hub upload-logo ./banner.jpg --type=banner

Replacing a variant deletes the previous file from S3.
`)
    .action(async (filePath: string, opts: {
      type: string;
      apiKey?: string;
      baseUrl?: string;
      json?: boolean;
      quiet?: boolean;
    }) => {
      const output = createOutput(opts);
      if (!LOGO_TYPES.includes(opts.type as LogoType)) {
        throw new GenniaCliError({
          code: "invalid_logo_type",
          message: `--type must be one of ${LOGO_TYPES.join(", ")}; got "${opts.type}".`,
          exitCode: ExitCode.Usage,
        });
      }
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
          message: `File extension ${ext} is not supported for logos.`,
          exitCode: ExitCode.Usage,
          hint: `Allowed: ${[...ALLOWED_EXTS].join(", ")}.`,
        });
      }
      const auth = resolveAuth(opts);
      output.info(`Uploading ${filePath} as ${opts.type} logo…`);
      const result = await uploadFile({
        apiKey: auth.apiKey,
        baseUrl: auth.baseUrl,
        path: `/hub/logos/${encodeURIComponent(opts.type)}`,
        filePath,
        contentType: mimeFromExt(ext),
        userAgent: `gennia-cli/${CLI_VERSION}`,
      });
      assertUploadOk(result);
      output.success(`Logo updated (${opts.type}).`);
      output.data(result.body);
    });
}

function mimeFromExt(ext: string): string {
  switch (ext) {
    case ".png":
      return "image/png";
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".webp":
      return "image/webp";
    case ".svg":
      return "image/svg+xml";
    default:
      return "application/octet-stream";
  }
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

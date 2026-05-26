import { Command } from "commander";
import { existsSync, readFileSync } from "node:fs";
import { uploadFile } from "@gennia/sdk";
import { createOutput } from "../../lib/output.js";
import { resolveAuth } from "../../lib/auth.js";
import { ExitCode, GenniaCliError, type ExitCodeValue } from "../../lib/errors.js";
import { CLI_VERSION } from "../../lib/sdk.js";

const ALLOWED_EXTS = new Set([".pdf", ".txt", ".csv", ".docx", ".md"]);

export function buildKnowledgeUploadCommand(): Command {
  return new Command("upload")
    .description("Upload a file as a knowledge source. Supports PDF, TXT, CSV, DOCX, MD.")
    .argument("<file>", "Path to the local file to upload")
    .option("--name <name>", "Display name. Defaults to the file's basename.")
    .option("--description <text>", "Optional description")
    .option("--metadata <json>", "Raw metadata JSON (overrides --name/--description). Use @path.json to read from a file, or `-` for stdin.")
    .option("--api-key <key>", "Override saved/env API key")
    .option("--base-url <url>", "Override the API base URL")
    .option("--json", "Emit structured JSON output to stdout")
    .option("--quiet", "Suppress all human-readable output")
    .addHelpText("after", `
Examples:
  $ gennia knowledge upload ./q4-plan.pdf --name "Q4 Plan 2026"
  $ gennia knowledge upload ./data.csv --metadata '{"name":"Sales 2026","description":"raw export"}'
  $ gennia knowledge upload ./doc.pdf --metadata @./meta.json

Exit codes: 0 success, 2 usage (file missing / bad metadata), 4 unauthorized, 1 server error.
`)
    .action(async (filePath: string, opts: {
      name?: string;
      description?: string;
      metadata?: string;
      apiKey?: string;
      baseUrl?: string;
      json?: boolean;
      quiet?: boolean;
    }) => {
      const output = createOutput(opts);
      assertFileExists(filePath);
      assertExtensionAllowed(filePath);

      const metadata = buildMetadata(opts, filePath);
      const auth = resolveAuth(opts);

      output.info(`Uploading ${filePath} to ${auth.baseUrl}…`);
      const result = await uploadFile({
        apiKey: auth.apiKey,
        baseUrl: auth.baseUrl,
        path: "/knowledge-sources",
        filePath,
        fields: { metadata },
        userAgent: `gennia-cli/${CLI_VERSION}`,
      });
      assertUploadOk(result);

      output.success("Knowledge source created.");
      output.data(result.body);
    });
}

function assertFileExists(filePath: string): void {
  if (!existsSync(filePath)) {
    throw new GenniaCliError({
      code: "file_not_found",
      message: `File does not exist: ${filePath}`,
      exitCode: ExitCode.Usage,
      hint: "Pass an absolute path or one relative to the current directory.",
    });
  }
}

function assertExtensionAllowed(filePath: string): void {
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
}

function buildMetadata(
  opts: { name?: string; description?: string; metadata?: string },
  filePath: string,
): string {
  if (opts.metadata) {
    const raw = loadMetadataSource(opts.metadata);
    // Validate it's parseable JSON; let the server reject if shape is wrong.
    try {
      JSON.parse(raw);
    } catch (err) {
      throw new GenniaCliError({
        code: "invalid_metadata_json",
        message: "--metadata must be valid JSON.",
        exitCode: ExitCode.Usage,
        context: { reason: err instanceof Error ? err.message : String(err) },
      });
    }
    return raw;
  }
  const basename = filePath.split(/[\\/]/).pop() ?? "Knowledge Source";
  const fallback: Record<string, string> = { name: opts.name ?? basename };
  if (opts.description) fallback.description = opts.description;
  return JSON.stringify(fallback);
}

function loadMetadataSource(input: string): string {
  if (input === "-") return readFileSync(0, "utf8").trim();
  if (input.startsWith("@")) return readFileSync(input.slice(1), "utf8").trim();
  return input;
}

function assertUploadOk(result: { ok: boolean; status: number; body: unknown }): void {
  if (result.ok) return;
  const message = readMessage(result.body) ?? `Upload failed with HTTP ${result.status}.`;
  throw new GenniaCliError({
    code: readCode(result.body) ?? `http_${result.status}`,
    message,
    exitCode: mapStatusToExitCode(result.status),
    context: { status: result.status, body: result.body },
  });
}

function readMessage(body: unknown): string | null {
  if (body && typeof body === "object" && "message" in (body as Record<string, unknown>)) {
    const message = (body as Record<string, unknown>).message;
    return typeof message === "string" ? message : null;
  }
  return null;
}

function readCode(body: unknown): string | null {
  if (body && typeof body === "object" && "code" in (body as Record<string, unknown>)) {
    const code = (body as Record<string, unknown>).code;
    return typeof code === "string" ? code : null;
  }
  return null;
}

function mapStatusToExitCode(status: number): ExitCodeValue {
  if (status === 404) return ExitCode.NotFound;
  if (status === 401 || status === 403) return ExitCode.Unauthorized;
  if (status === 409) return ExitCode.Conflict;
  if (status >= 400 && status < 500) return ExitCode.Usage;
  return ExitCode.Generic;
}

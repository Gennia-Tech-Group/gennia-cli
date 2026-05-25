import { Command } from "commander";
import { readFileSync } from "node:fs";
import { createOutput } from "../lib/output.js";
import { resolveAuth } from "../lib/auth.js";
import { ExitCode, GenniaCliError, type ExitCodeValue } from "../lib/errors.js";
import { CLI_VERSION } from "../lib/sdk.js";

const PUBLIC_API_PREFIX = "/public/api/v1";
const VALID_METHODS = new Set(["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "HEAD"]);

export function buildApiCommand(): Command {
  return new Command("api")
    .description("Raw Gennia Public API call. Covers every endpoint without a dedicated CLI subcommand.")
    .argument("<method>", "HTTP method (GET, POST, PUT, PATCH, DELETE)")
    .argument("<path>", "Path under /public/api/v1, or a full path, or a full URL")
    .option("--body <value>", "Request body. Inline JSON, @path/to/file, or `-` to read from stdin.")
    .option("--query <string>", "URL-encoded query string (e.g. \"limit=5&status=active\"). Merged with --page/--limit.")
    .option("--header <kv>", "Extra header in the form Name: Value (repeatable)", collectKv, [] as string[][])
    .option("--page <n>", "1-based page index (added to the query string)")
    .option("--limit <n>", "Page size (added to the query string)")
    .option("--all", "Auto-paginate: keep calling pages until items[] is exhausted")
    .option("--api-key <key>", "Override saved/env API key")
    .option("--base-url <url>", "Override the API base URL")
    .option("--json", "Emit structured JSON output to stdout")
    .option("--quiet", "Suppress all human-readable output")
    .addHelpText("after", `
Examples:
  # List the first 5 agents
  $ gennia api GET /agents --query 'limit=5&status=active'

  # Create one (inline body)
  $ gennia api POST /agents --body '{"name":"Test"}'

  # Body from a file
  $ gennia api POST /agents --body @./payload.json

  # Body from stdin
  $ echo '{"name":"Test"}' | gennia api POST /agents --body -

  # Pipe to jq
  $ gennia api GET /agents --limit 50 | jq '.items | map(.name)'

  # Walk every page until exhausted
  $ gennia api GET /agents --all > all-agents.json

Exit codes: 0 success, 1 generic / HTTP 5xx, 2 usage, 3 HTTP 404,
4 HTTP 401/403, 5 HTTP 409.
`)
    .action(async (rawMethod: string, rawPath: string, opts: {
      body?: string;
      query?: string;
      header?: string[][];
      page?: string;
      limit?: string;
      all?: boolean;
      apiKey?: string;
      baseUrl?: string;
      json?: boolean;
      quiet?: boolean;
    }) => {
      const output = createOutput(opts);
      const method = rawMethod.toUpperCase();
      if (!VALID_METHODS.has(method)) {
        throw new GenniaCliError({
          code: "invalid_method",
          message: `Unknown HTTP method: ${rawMethod}`,
          exitCode: ExitCode.Usage,
          hint: `Use one of ${[...VALID_METHODS].join(", ")}.`,
        });
      }

      const auth = resolveAuth(opts);
      const baseHeaders: Record<string, string> = {
        "X-Api-Key": auth.apiKey,
        "User-Agent": `gennia-cli/${CLI_VERSION}`,
        Accept: "application/json",
      };
      for (const pair of opts.header ?? []) {
        const [name, value] = pair;
        if (!name || value === undefined) continue;
        baseHeaders[name] = value;
      }

      const body = opts.body !== undefined ? loadBody(opts.body) : undefined;
      if (body !== undefined) {
        baseHeaders["Content-Type"] = baseHeaders["Content-Type"] ?? "application/json";
      }

      const baseQuery = parseQuery(opts.query);
      if (opts.page) baseQuery.set("page", opts.page);
      if (opts.limit) baseQuery.set("limit", opts.limit);

      if (opts.all) {
        if (method !== "GET") {
          throw new GenniaCliError({
            code: "invalid_pagination",
            message: "--all only makes sense with GET requests.",
            exitCode: ExitCode.Usage,
          });
        }
        const aggregated = await fetchAllPages({ method, path: rawPath, baseUrl: auth.baseUrl, headers: baseHeaders, query: baseQuery });
        output.data(aggregated);
        return;
      }

      const url = buildUrl(rawPath, auth.baseUrl, baseQuery);
      const response = await fetch(url, { method, headers: baseHeaders, body });
      await emitResponse(response, output);
    });
}

function collectKv(value: string, previous: string[][]): string[][] {
  const idx = value.indexOf(":");
  if (idx === -1) {
    throw new GenniaCliError({
      code: "invalid_header",
      message: `Header "${value}" must be Name: Value.`,
      exitCode: ExitCode.Usage,
    });
  }
  const name = value.slice(0, idx).trim();
  const headerValue = value.slice(idx + 1).trim();
  return [...previous, [name, headerValue]];
}

function loadBody(input: string): string {
  if (input === "-") {
    return readFileSync(0, "utf8");
  }
  if (input.startsWith("@")) {
    return readFileSync(input.slice(1), "utf8");
  }
  return input;
}

function parseQuery(raw: string | undefined): URLSearchParams {
  if (!raw) return new URLSearchParams();
  return new URLSearchParams(raw.startsWith("?") ? raw.slice(1) : raw);
}

function buildUrl(path: string, baseUrl: string, query: URLSearchParams): URL {
  let target: URL;
  if (/^https?:\/\//.test(path)) {
    target = new URL(path);
  } else {
    const normalized = path.startsWith("/") ? path : `/${path}`;
    const prefixed = normalized.startsWith(`${PUBLIC_API_PREFIX}/`) || normalized === PUBLIC_API_PREFIX
      ? normalized
      : `${PUBLIC_API_PREFIX}${normalized}`;
    target = new URL(prefixed, baseUrl);
  }
  for (const [k, v] of query) {
    target.searchParams.set(k, v);
  }
  return target;
}

async function emitResponse(response: Response, output: ReturnType<typeof createOutput>): Promise<void> {
  const contentType = response.headers.get("content-type") ?? "";
  const text = await response.text();
  const parsed: unknown = contentType.includes("application/json") && text ? safeJsonParse(text) : text;

  if (!response.ok) {
    process.exitCode = mapHttpStatusToExitCode(response.status);
    const message = typeof parsed === "object" && parsed && "message" in (parsed as Record<string, unknown>)
      ? String((parsed as Record<string, unknown>).message)
      : `HTTP ${response.status}`;
    output.error(new GenniaCliError({
      code: extractCode(parsed) ?? `http_${response.status}`,
      message,
      exitCode: mapHttpStatusToExitCode(response.status),
      context: {
        status: response.status,
        body: typeof parsed === "string" ? parsed.slice(0, 400) : parsed,
      },
    }));
    return;
  }

  if (text === "") {
    output.data({ status: response.status });
    return;
  }
  output.data(parsed);
}

function extractCode(parsed: unknown): string | null {
  if (parsed && typeof parsed === "object" && "code" in (parsed as Record<string, unknown>)) {
    const code = (parsed as Record<string, unknown>).code;
    return typeof code === "string" ? code : null;
  }
  return null;
}

function safeJsonParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function mapHttpStatusToExitCode(status: number): ExitCodeValue {
  if (status === 404) return ExitCode.NotFound;
  if (status === 401 || status === 403) return ExitCode.Unauthorized;
  if (status === 409) return ExitCode.Conflict;
  if (status >= 400 && status < 500) return ExitCode.Usage;
  return ExitCode.Generic;
}

interface PaginatedPage {
  items?: unknown[];
  page?: number;
  totalPages?: number;
  total?: number;
}

interface FetchAllParams {
  method: string;
  path: string;
  baseUrl: string;
  headers: Record<string, string>;
  query: URLSearchParams;
}

async function fetchAllPages(params: FetchAllParams): Promise<{ items: unknown[]; total: number; pages: number }> {
  const collected: unknown[] = [];
  let page = parseInt(params.query.get("page") ?? "1", 10);
  let totalPages = 1;
  let total = 0;
  while (true) {
    const q = new URLSearchParams(params.query);
    q.set("page", String(page));
    const url = buildUrl(params.path, params.baseUrl, q);
    const response = await fetch(url, { method: params.method, headers: params.headers });
    if (!response.ok) {
      throw new GenniaCliError({
        code: extractCode(await response.json().catch(() => null)) ?? `http_${response.status}`,
        message: `Pagination aborted at page ${page} (HTTP ${response.status}).`,
        exitCode: mapHttpStatusToExitCode(response.status),
      });
    }
    const body = (await response.json()) as PaginatedPage;
    if (!Array.isArray(body.items)) {
      throw new GenniaCliError({
        code: "not_paginated",
        message: "--all only works on endpoints that return { items: [...] }.",
        exitCode: ExitCode.Usage,
      });
    }
    collected.push(...body.items);
    totalPages = body.totalPages ?? page;
    total = body.total ?? collected.length;
    if (page >= totalPages) break;
    page += 1;
  }
  return { items: collected, total, pages: totalPages };
}

/**
 * Multipart upload helper for endpoints that take `multipart/form-data`.
 *
 * Reads a local file, attaches it under the configured field name (default
 * `"file"`), and adds any extra string fields as additional multipart parts.
 * Authentication headers are set the same way the typed client does.
 *
 * Used by both `@gennia/cli` (dedicated upload commands) and `@gennia/mcp`
 * (the tools generated for multipart endpoints).
 */
import { readFile } from "node:fs/promises";
import { basename } from "node:path";

import { DEFAULT_BASE_URL } from "./index.js";

export interface UploadFileParams {
  /** Workspace API key (sent as `X-Api-Key`). */
  apiKey: string;
  /** Base URL, defaults to {@link DEFAULT_BASE_URL}. */
  baseUrl?: string;
  /** Path under /public/api/v1, e.g. `/knowledge-sources`. */
  path: string;
  /** Absolute or relative path to the local file. */
  filePath: string;
  /** Override the filename sent in the Content-Disposition (defaults to basename). */
  filename?: string;
  /** Override the multipart field name for the file (defaults to "file"). */
  fileField?: string;
  /** MIME type for the file part (default `application/octet-stream`). */
  contentType?: string;
  /** Extra string fields appended to the form (e.g. `{ metadata: "{...}" }`). */
  fields?: Record<string, string>;
  /** Optional User-Agent suffix. */
  userAgent?: string;
}

export interface UploadFileResult {
  ok: boolean;
  status: number;
  body: unknown;
}

const PUBLIC_API_PREFIX = "/public/api/v1";

/**
 * Send a multipart/form-data request with a local file attached. Endpoints
 * paths are auto-prefixed with `/public/api/v1` when they don't start with it.
 */
export async function uploadFile(params: UploadFileParams): Promise<UploadFileResult> {
  const {
    apiKey,
    baseUrl = DEFAULT_BASE_URL,
    path,
    filePath,
    filename,
    fileField = "file",
    contentType = "application/octet-stream",
    fields = {},
    userAgent,
  } = params;

  const bytes = await readFile(filePath);
  const blob = new Blob([new Uint8Array(bytes)], { type: contentType });

  const form = new FormData();
  form.append(fileField, blob, filename ?? basename(filePath));
  for (const [name, value] of Object.entries(fields)) {
    form.append(name, value);
  }

  const url = new URL(
    /^https?:\/\//.test(path)
      ? path
      : `${path.startsWith(PUBLIC_API_PREFIX) ? path : `${PUBLIC_API_PREFIX}${path.startsWith("/") ? path : `/${path}`}`}`,
    /^https?:\/\//.test(path) ? undefined : baseUrl,
  );

  const headers: Record<string, string> = {
    "X-Api-Key": apiKey,
    Accept: "application/json",
  };
  if (userAgent) headers["User-Agent"] = userAgent;
  // Don't set Content-Type — the FormData boundary is added automatically.

  const response = await fetch(url, { method: "POST", headers, body: form });

  const contentTypeHeader = response.headers.get("content-type") ?? "";
  const text = await response.text();
  let body: unknown = text;
  if (text && contentTypeHeader.includes("application/json")) {
    try {
      body = JSON.parse(text);
    } catch {
      // keep as text
    }
  } else if (text === "") {
    body = null;
  }

  return { ok: response.ok, status: response.status, body };
}

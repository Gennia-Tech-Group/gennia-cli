import { uploadFile } from "@gennia/sdk";
import type { GenniaMcpConfig } from "./config.js";
import type { ResolvedOperation } from "./openapi.js";
import { flattenMultipartFields } from "./schema.js";

export interface ExecuteResult {
  ok: boolean;
  status: number;
  body: unknown;
  contentType: string | null;
}

const SAFE_HEADER_NAMES = /^[a-zA-Z0-9\-_]+$/;

function appendQuery(params: URLSearchParams, name: string, value: unknown): void {
  if (value === undefined || value === null) return;
  if (Array.isArray(value)) {
    for (const item of value) params.append(name, String(item));
    return;
  }
  if (typeof value === "object") {
    params.set(name, JSON.stringify(value));
    return;
  }
  params.set(name, String(value));
}

export async function executeOperation(
  op: ResolvedOperation,
  args: Record<string, unknown>,
  config: GenniaMcpConfig,
): Promise<ExecuteResult> {
  return op.multipart
    ? executeMultipart(op, args, config)
    : executeJson(op, args, config);
}

async function executeJson(
  op: ResolvedOperation,
  args: Record<string, unknown>,
  config: GenniaMcpConfig,
): Promise<ExecuteResult> {
  let path = op.path;
  const query = new URLSearchParams();
  const headers: Record<string, string> = {
    "X-Api-Key": config.apiKey,
    "User-Agent": config.userAgent,
    Accept: "application/json",
  };

  for (const param of op.operation.parameters ?? []) {
    const value = args[param.name];
    const isRequired = param.required || param.in === "path";
    if (value === undefined) {
      if (isRequired) {
        throw new Error(`Missing required ${param.in} parameter: ${param.name}`);
      }
      continue;
    }
    if (param.in === "path") {
      path = path.replace(`{${param.name}}`, encodeURIComponent(String(value)));
    } else if (param.in === "query") {
      appendQuery(query, param.name, value);
    } else if (param.in === "header") {
      if (!SAFE_HEADER_NAMES.test(param.name)) continue;
      headers[param.name] = String(value);
    }
  }

  const url = new URL(path, config.baseUrl);
  const queryString = query.toString();
  if (queryString) url.search = queryString;

  let body: string | undefined;
  if (op.operation.requestBody?.content?.["application/json"] && args.body !== undefined) {
    body = JSON.stringify(args.body);
    headers["Content-Type"] = "application/json";
  }

  const response = await fetch(url.toString(), {
    method: op.method.toUpperCase(),
    headers,
    body,
  });

  const contentType = response.headers.get("content-type");
  const text = await response.text();
  let parsed: unknown = text;
  if (text && contentType?.includes("application/json")) {
    try {
      parsed = JSON.parse(text);
    } catch {
      // keep as text if the server lied about content-type
    }
  } else if (text === "") {
    parsed = null;
  }

  return {
    ok: response.ok,
    status: response.status,
    body: parsed,
    contentType,
  };
}

async function executeMultipart(
  op: ResolvedOperation,
  args: Record<string, unknown>,
  config: GenniaMcpConfig,
): Promise<ExecuteResult> {
  const { fields, fileField } = flattenMultipartFields(op.operation);
  const filePathRaw = args.file_path;
  if (typeof filePathRaw !== "string" || filePathRaw.length === 0) {
    throw new Error("Missing required `file_path` (absolute or relative path to the file to upload).");
  }

  let path = op.path;
  for (const param of op.operation.parameters ?? []) {
    if (param.in !== "path") continue;
    const value = args[param.name];
    if (value === undefined) {
      throw new Error(`Missing required path parameter: ${param.name}`);
    }
    path = path.replace(`{${param.name}}`, encodeURIComponent(String(value)));
  }

  const query = new URLSearchParams();
  for (const param of op.operation.parameters ?? []) {
    if (param.in === "query") {
      const value = args[param.name];
      if (value !== undefined) appendQuery(query, param.name, value);
    }
  }
  const url = new URL(path, config.baseUrl);
  if (query.toString()) url.search = query.toString();

  // Extra non-file multipart fields (everything from the flattened body except
  // the `file_path` we already handled).
  const extra: Record<string, string> = {};
  for (const field of fields) {
    if (field.name === "file_path") continue;
    const value = args[field.name];
    if (value === undefined) continue;
    extra[field.name] = typeof value === "string" ? value : JSON.stringify(value);
  }

  const result = await uploadFile({
    apiKey: config.apiKey,
    baseUrl: url.origin,
    path: `${url.pathname}${url.search}`,
    filePath: filePathRaw,
    fileField,
    fields: extra,
    userAgent: config.userAgent,
  });

  return {
    ok: result.ok,
    status: result.status,
    body: result.body,
    contentType: null,
  };
}

import type { GenniaMcpConfig } from "./config.js";
import type { ResolvedOperation } from "./openapi.js";

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

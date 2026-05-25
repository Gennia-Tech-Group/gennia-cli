import { createRequire } from "node:module";

const require_ = createRequire(import.meta.url);

export interface OpenAPISpec {
  paths?: Record<string, PathItem | undefined>;
  components?: { schemas?: Record<string, unknown> };
}

type HttpMethod = "get" | "put" | "post" | "delete" | "options" | "head" | "patch";

export type PathItem = {
  [K in HttpMethod]?: OpenAPIOperation;
};

export interface OpenAPIOperation {
  operationId?: string;
  summary?: string;
  description?: string;
  tags?: string[];
  parameters?: OpenAPIParameter[];
  requestBody?: OpenAPIRequestBody;
}

export interface OpenAPIParameter {
  name: string;
  in: "path" | "query" | "header" | "cookie";
  description?: string;
  required?: boolean;
  schema?: Record<string, unknown>;
}

export interface OpenAPIRequestBody {
  description?: string;
  required?: boolean;
  content?: Record<string, { schema?: Record<string, unknown> }>;
}

export interface ResolvedOperation {
  method: HttpMethod;
  path: string;
  operationId: string;
  summary?: string;
  description?: string;
  tag: string;
  toolName: string;
  operation: OpenAPIOperation;
}

const HTTP_METHODS: HttpMethod[] = ["get", "put", "post", "delete", "options", "head", "patch"];

export function loadSpec(): OpenAPISpec {
  return require_("@gennia/sdk/openapi") as OpenAPISpec;
}

function toSnakeCase(input: string): string {
  return input
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/[\s-]+/g, "_")
    .replace(/[^a-zA-Z0-9_]/g, "_")
    .toLowerCase();
}

function isMultipart(op: OpenAPIOperation): boolean {
  return Boolean(op.requestBody?.content && "multipart/form-data" in op.requestBody.content);
}

function isStreaming(path: string, method: HttpMethod): boolean {
  return method === "post" && path.endsWith("/messages/stream");
}

export function listOperations(spec: OpenAPISpec): ResolvedOperation[] {
  const ops: ResolvedOperation[] = [];
  for (const [path, pathItem] of Object.entries(spec.paths ?? {})) {
    if (!pathItem) continue;
    for (const method of HTTP_METHODS) {
      const op = pathItem[method];
      if (!op) continue;
      if (!op.operationId) continue;
      if (isStreaming(path, method)) continue;
      if (isMultipart(op)) continue;
      const tag = op.tags?.[0] ?? "default";
      const toolName = `${toSnakeCase(tag)}__${toSnakeCase(op.operationId)}`;
      ops.push({
        method,
        path,
        operationId: op.operationId,
        summary: op.summary,
        description: op.description,
        tag,
        toolName,
        operation: op,
      });
    }
  }
  return ops.sort((a, b) => a.toolName.localeCompare(b.toolName));
}

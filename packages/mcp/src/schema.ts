import type { OpenAPIOperation, OpenAPISpec } from "./openapi.js";

export interface InputSchema {
  type: "object";
  properties: Record<string, unknown>;
  required?: string[];
  additionalProperties?: boolean;
  $defs?: Record<string, unknown>;
}

const COMPONENTS_PREFIX = "#/components/schemas/";
const DEFS_PREFIX = "#/$defs/";

function rewriteRefs(node: unknown): unknown {
  if (Array.isArray(node)) {
    return node.map(rewriteRefs);
  }
  if (!node || typeof node !== "object") {
    return node;
  }
  const obj = node as Record<string, unknown>;
  const ref = obj.$ref;
  if (typeof ref === "string" && ref.startsWith(COMPONENTS_PREFIX)) {
    const next: Record<string, unknown> = { ...obj, $ref: DEFS_PREFIX + ref.slice(COMPONENTS_PREFIX.length) };
    return next;
  }
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    out[key] = rewriteRefs(value);
  }
  return out;
}

function collectRefs(roots: unknown[], allSchemas: Record<string, unknown>): Record<string, unknown> {
  const collected: Record<string, unknown> = {};
  const visited = new Set<string>();
  const queue: unknown[] = [...roots];
  while (queue.length > 0) {
    const node = queue.shift();
    if (!node) continue;
    if (Array.isArray(node)) {
      queue.push(...node);
      continue;
    }
    if (typeof node !== "object") continue;
    const obj = node as Record<string, unknown>;
    const ref = obj.$ref;
    if (typeof ref === "string" && ref.startsWith(COMPONENTS_PREFIX)) {
      const name = ref.slice(COMPONENTS_PREFIX.length);
      if (!visited.has(name) && name in allSchemas) {
        visited.add(name);
        const schema = allSchemas[name];
        collected[name] = rewriteRefs(schema);
        queue.push(schema);
      }
      continue;
    }
    queue.push(...Object.values(obj));
  }
  return collected;
}

export function buildInputSchema(op: OpenAPIOperation, spec: OpenAPISpec): InputSchema {
  const properties: Record<string, unknown> = {};
  const required: string[] = [];

  for (const param of op.parameters ?? []) {
    if (param.in !== "path" && param.in !== "query" && param.in !== "header") continue;
    const baseSchema = (param.schema ?? { type: "string" }) as Record<string, unknown>;
    const rewritten = rewriteRefs(baseSchema) as Record<string, unknown>;
    properties[param.name] = param.description
      ? { ...rewritten, description: param.description }
      : rewritten;
    if (param.required || param.in === "path") {
      required.push(param.name);
    }
  }

  const jsonBody = op.requestBody?.content?.["application/json"]?.schema;
  if (jsonBody) {
    const rewritten = rewriteRefs(jsonBody) as Record<string, unknown>;
    properties.body = op.requestBody?.description
      ? { ...rewritten, description: op.requestBody.description }
      : rewritten;
    if (op.requestBody?.required) {
      required.push("body");
    }
  }

  const allSchemas = spec.components?.schemas ?? {};
  const $defs = collectRefs([op.parameters, op.requestBody], allSchemas);

  const result: InputSchema = { type: "object", properties };
  if (required.length > 0) result.required = required;
  if (Object.keys($defs).length > 0) result.$defs = $defs;
  return result;
}

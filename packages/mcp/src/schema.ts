import type { OpenAPIOperation, OpenAPISpec, ResolvedOperation } from "./openapi.js";

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

function isBinaryFileSchema(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  const obj = value as Record<string, unknown>;
  return obj.type === "string" && obj.format === "binary";
}

interface ParamSpec {
  name: string;
  schema: Record<string, unknown>;
  required: boolean;
}

function flattenMultipartFields(op: OpenAPIOperation): {
  fields: ParamSpec[];
  /** Multipart field name that holds the binary file payload (default `file`). */
  fileField: string;
} {
  const schema = op.requestBody?.content?.["multipart/form-data"]?.schema;
  const fields: ParamSpec[] = [];
  let fileField = "file";
  if (!schema || typeof schema !== "object") return { fields, fileField };

  const requiredList = Array.isArray((schema as Record<string, unknown>).required)
    ? ((schema as Record<string, unknown>).required as string[])
    : [];
  const props = (schema as Record<string, unknown>).properties;
  if (!props || typeof props !== "object") return { fields, fileField };

  for (const [name, raw] of Object.entries(props as Record<string, unknown>)) {
    if (isBinaryFileSchema(raw)) {
      fileField = name;
      const description = (raw as Record<string, unknown>).description as string | undefined;
      fields.push({
        name: "file_path",
        schema: {
          type: "string",
          description:
            description ?? `Absolute or relative path to the local file to upload (originally multipart field "${name}").`,
        },
        required: requiredList.includes(name),
      });
      continue;
    }
    const cloned = rewriteRefs(raw) as Record<string, unknown>;
    fields.push({
      name,
      schema: cloned,
      required: requiredList.includes(name),
    });
  }
  return { fields, fileField };
}

export function buildInputSchema(op: OpenAPIOperation, spec: OpenAPISpec, ctx: { multipart?: boolean } = {}): InputSchema {
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

  if (ctx.multipart) {
    const { fields } = flattenMultipartFields(op);
    for (const field of fields) {
      properties[field.name] = field.schema;
      if (field.required) required.push(field.name);
    }
  } else {
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
  }

  const allSchemas = spec.components?.schemas ?? {};
  const refRoots: unknown[] = [op.parameters];
  if (ctx.multipart) {
    refRoots.push(op.requestBody?.content?.["multipart/form-data"]?.schema);
  } else {
    refRoots.push(op.requestBody);
  }
  const $defs = collectRefs(refRoots, allSchemas);

  const result: InputSchema = { type: "object", properties };
  if (required.length > 0) result.required = required;
  if (Object.keys($defs).length > 0) result.$defs = $defs;
  return result;
}

/**
 * Convenience wrapper used by `index.ts` so call sites don't have to pass the
 * multipart flag twice.
 */
export function buildInputSchemaForOperation(op: ResolvedOperation, spec: OpenAPISpec): InputSchema {
  return buildInputSchema(op.operation, spec, { multipart: op.multipart });
}

export { flattenMultipartFields };

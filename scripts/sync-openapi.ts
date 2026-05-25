#!/usr/bin/env tsx
/**
 * Re-vendor the public OpenAPI spec from a sibling `gennia-studio-backend` checkout.
 *
 * Lookup order for the source spec:
 *   1. $GENNIA_BACKEND_OPENAPI           — full path to a JSON file
 *   2. $GENNIA_BACKEND_DIR/openapi/public-api-v1.json
 *   3. ../gennia-studio-backend/openapi/public-api-v1.json (relative to repo root)
 *   4. ../gennia-main/gennia-studio-backend/openapi/public-api-v1.json
 *
 * Writes a pretty-printed copy to packages/sdk/openapi.json so PR diffs stay readable.
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..");
const destination = join(repoRoot, "packages/sdk/openapi.json");

function candidates(): string[] {
  const list: string[] = [];
  if (process.env.GENNIA_BACKEND_OPENAPI) {
    list.push(process.env.GENNIA_BACKEND_OPENAPI);
  }
  if (process.env.GENNIA_BACKEND_DIR) {
    list.push(join(process.env.GENNIA_BACKEND_DIR, "openapi/public-api-v1.json"));
  }
  list.push(resolve(repoRoot, "../gennia-studio-backend/openapi/public-api-v1.json"));
  list.push(resolve(repoRoot, "../gennia-main/gennia-studio-backend/openapi/public-api-v1.json"));
  return list;
}

function findSource(): string {
  for (const candidate of candidates()) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }
  throw new Error(
    [
      "Could not locate the backend OpenAPI spec.",
      "Tried:",
      ...candidates().map((c) => `  - ${c}`),
      "",
      "Set GENNIA_BACKEND_OPENAPI to the full JSON path, or",
      "GENNIA_BACKEND_DIR to a gennia-studio-backend checkout.",
    ].join("\n"),
  );
}

function main(): void {
  const source = findSource();
  const raw = readFileSync(source, "utf8");
  const parsed: unknown = JSON.parse(raw);
  const pretty = `${JSON.stringify(parsed, null, 2)}\n`;
  writeFileSync(destination, pretty);
  console.log(`Synced OpenAPI spec`);
  console.log(`  from: ${source}`);
  console.log(`  to:   ${destination}`);
  console.log(`Next: pnpm sdk:generate`);
}

main();

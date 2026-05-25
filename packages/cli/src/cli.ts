#!/usr/bin/env node
import { run } from "./index.js";

run(process.argv).catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`gennia: ${message}`);
  process.exit(1);
});

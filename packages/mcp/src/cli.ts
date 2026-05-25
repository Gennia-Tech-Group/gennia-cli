#!/usr/bin/env node
import { runServer } from "./index.js";

runServer().catch((err) => {
  console.error("[gennia-mcp] fatal:", err);
  process.exit(1);
});

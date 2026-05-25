import { createGenniaClient, type GenniaClient } from "@gennia/sdk";
import type { ResolvedAuth } from "./auth.js";

export const CLI_VERSION = "0.2.0";

export function makeClient(auth: ResolvedAuth): GenniaClient {
  return createGenniaClient({
    apiKey: auth.apiKey,
    baseUrl: auth.baseUrl,
    userAgent: `gennia-cli/${CLI_VERSION}`,
  });
}

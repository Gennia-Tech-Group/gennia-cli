/**
 * Resolve auth credentials in this order:
 *   1. `--api-key` / `--base-url` flags (per-invocation override)
 *   2. `GENNIA_API_KEY` / `GENNIA_BASE_URL` env
 *   3. Persistent config from `gennia auth login`
 *   4. Error: missing
 */
import { DEFAULT_BASE_URL } from "@gennia/sdk";
import { loadConfig } from "./config.js";
import { ExitCode, GenniaCliError } from "./errors.js";

export interface ResolvedAuth {
  apiKey: string;
  baseUrl: string;
  source: "flag" | "env" | "config";
}

export interface AuthResolveFlags {
  apiKey?: string;
  baseUrl?: string;
}

export function resolveAuth(flags: AuthResolveFlags = {}): ResolvedAuth {
  if (flags.apiKey) {
    return {
      apiKey: flags.apiKey,
      baseUrl: flags.baseUrl ?? process.env.GENNIA_BASE_URL ?? DEFAULT_BASE_URL,
      source: "flag",
    };
  }
  if (process.env.GENNIA_API_KEY) {
    return {
      apiKey: process.env.GENNIA_API_KEY,
      baseUrl: flags.baseUrl ?? process.env.GENNIA_BASE_URL ?? DEFAULT_BASE_URL,
      source: "env",
    };
  }
  const config = loadConfig();
  if (config.apiKey) {
    return {
      apiKey: config.apiKey,
      baseUrl: flags.baseUrl ?? process.env.GENNIA_BASE_URL ?? config.baseUrl ?? DEFAULT_BASE_URL,
      source: "config",
    };
  }
  throw new GenniaCliError({
    code: "not_authenticated",
    message: "No Gennia credentials found.",
    exitCode: ExitCode.Unauthorized,
    hint: "Run `gennia auth login` to sign in, or pass --api-key.",
  });
}

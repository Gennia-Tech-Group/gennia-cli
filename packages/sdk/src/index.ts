import createClient, { type Client, type ClientOptions } from "openapi-fetch";
import type { paths } from "./openapi-types.js";

export const DEFAULT_BASE_URL = "https://api.gennia.ai";

export interface GenniaClientOptions extends Omit<ClientOptions, "baseUrl" | "headers"> {
  /**
   * Workspace API key (`gsk_...`). Sent as `X-Api-Key`. Required for most endpoints.
   */
  apiKey?: string;
  /**
   * Base URL override. Defaults to {@link DEFAULT_BASE_URL}. Use `https://api.dev.gennia.ai`
   * against the dev environment or `http://localhost:8080` for a local backend.
   */
  baseUrl?: string;
  /**
   * Extra headers merged onto every request. Per-call overrides still win.
   */
  headers?: Record<string, string>;
  /**
   * Optional `User-Agent` suffix appended to the default `gennia-sdk/<version>` string.
   * Useful for downstream tools (CLI, MCP) to identify themselves.
   */
  userAgent?: string;
}

export type GenniaClient = Client<paths>;

export function createGenniaClient(options: GenniaClientOptions = {}): GenniaClient {
  const { apiKey, baseUrl = DEFAULT_BASE_URL, headers = {}, userAgent, ...rest } = options;

  const mergedHeaders: Record<string, string> = {
    Accept: "application/json",
    ...headers,
  };

  if (apiKey) {
    mergedHeaders["X-Api-Key"] = apiKey;
  }

  if (userAgent) {
    mergedHeaders["User-Agent"] = userAgent;
  }

  return createClient<paths>({
    baseUrl,
    headers: mergedHeaders,
    ...rest,
  });
}

export type { paths, components, operations } from "./openapi-types.js";

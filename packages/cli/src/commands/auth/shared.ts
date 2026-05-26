import { GenniaCliError, ExitCode } from "../../lib/errors.js";

export interface HealthResponse {
  status: string;
  workspacePublicId: string;
  apiKeyPublicId: string;
}

/**
 * Calls `GET /public/api/v1/health` with the given creds and parses the response.
 * Throws a structured GenniaCliError on auth failure or network error.
 */
export async function healthCheck(params: { apiKey: string; baseUrl: string }): Promise<HealthResponse> {
  const url = new URL("/public/api/v1/health", params.baseUrl);
  let response: Response;
  try {
    response = await fetch(url, {
      method: "GET",
      headers: {
        "X-Api-Key": params.apiKey,
        Accept: "application/json",
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new GenniaCliError({
      code: "network_error",
      message: `Could not reach ${params.baseUrl}`,
      exitCode: ExitCode.Generic,
      hint: "Check your internet connection or override --base-url.",
      context: { reason: message },
    });
  }

  if (response.status === 401 || response.status === 403) {
    const isProd = params.baseUrl.includes("api.gennia.ai") && !params.baseUrl.includes("dev");
    const envHint = isProd
      ? "If this key was generated in a non-prod workspace (dev, local), retry with --base-url=https://api.dev.gennia.ai (or your local backend)."
      : "Double-check that the key belongs to the workspace at this base URL — keys are env-scoped.";
    throw new GenniaCliError({
      code: "invalid_credentials",
      message: `API key rejected (HTTP ${response.status}) by ${params.baseUrl}.`,
      exitCode: ExitCode.Unauthorized,
      hint: `${envHint} Generate a fresh key in Studio: workspace → Settings → API Keys.`,
      context: { status: response.status, baseUrl: params.baseUrl },
    });
  }

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new GenniaCliError({
      code: "health_check_failed",
      message: `Health check returned HTTP ${response.status}.`,
      exitCode: ExitCode.Generic,
      context: { status: response.status, body: body.slice(0, 200) },
    });
  }

  const body = (await response.json().catch(() => ({}))) as Partial<HealthResponse>;
  if (!body.workspacePublicId || !body.apiKeyPublicId) {
    throw new GenniaCliError({
      code: "unexpected_response",
      message: "Health endpoint returned an unexpected shape.",
      exitCode: ExitCode.Generic,
      context: { body },
    });
  }
  return {
    status: body.status ?? "ok",
    workspacePublicId: body.workspacePublicId,
    apiKeyPublicId: body.apiKeyPublicId,
  };
}

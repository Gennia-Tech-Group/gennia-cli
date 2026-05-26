/**
 * Exit codes — agents check `$?` to branch.
 *
 *   0 success
 *   1 generic
 *   2 usage (bad flag, wrong arg)
 *   3 not found (no such resource)
 *   4 unauthorized (auth missing, expired, lacks perm)
 *   5 conflict (already exists, version mismatch)
 */
export const ExitCode = {
  Success: 0,
  Generic: 1,
  Usage: 2,
  NotFound: 3,
  Unauthorized: 4,
  Conflict: 5,
} as const;

export type ExitCodeValue = (typeof ExitCode)[keyof typeof ExitCode];

export interface StructuredError {
  code: string;
  message: string;
  hint?: string;
  [key: string]: unknown;
}

/**
 * Domain error with a stable `code` (enum, agent-parseable) plus optional
 * `hint` describing the next action.
 */
export class GenniaCliError extends Error {
  readonly code: string;
  readonly exitCode: ExitCodeValue;
  readonly hint?: string;
  readonly context: Record<string, unknown>;

  constructor(params: {
    code: string;
    message: string;
    exitCode?: ExitCodeValue;
    hint?: string;
    context?: Record<string, unknown>;
  }) {
    super(params.message);
    this.code = params.code;
    this.exitCode = params.exitCode ?? ExitCode.Generic;
    this.hint = params.hint;
    this.context = params.context ?? {};
    this.name = "GenniaCliError";
  }

  toStructured(): StructuredError {
    const out: StructuredError = { code: this.code, message: this.message };
    if (this.hint) out.hint = this.hint;
    for (const [key, value] of Object.entries(this.context)) {
      if (out[key] === undefined) out[key] = value;
    }
    return out;
  }
}

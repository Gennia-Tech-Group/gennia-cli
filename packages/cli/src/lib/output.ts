/**
 * Output contract:
 *   - `data(value)`  → stdout. JSON when `--json`/non-TTY/`--quiet`; otherwise human prose.
 *   - `info(text)`   → stderr. Progress, banners, non-critical hints.
 *   - `success(...)` → stderr. Final confirmation in human runs.
 *   - `error(err)`   → stderr. Always JSON-shaped with `error` wrapper when `--json`.
 *
 * Agents piping into `jq` see only data on stdout. Humans see everything.
 */
import pc from "picocolors";
import { GenniaCliError, type StructuredError } from "./errors.js";

export interface OutputOptions {
  json: boolean;
  quiet: boolean;
  color: boolean;
}

export interface Output {
  readonly opts: OutputOptions;
  /** Write the primary payload (or its JSON form). */
  data(payload: unknown, pretty?: (value: unknown) => string): void;
  /** Human-only side message; suppressed in --json/--quiet. */
  info(message: string): void;
  /** Human-only success line; suppressed in --json/--quiet. */
  success(message: string): void;
  /** Render an error in the chosen format. Does not exit. */
  error(err: unknown): void;
}

export function resolveOutputOptions(flags: {
  json?: boolean;
  quiet?: boolean;
}): OutputOptions {
  const stdoutTty = process.stdout.isTTY === true;
  const noColor = process.env.NO_COLOR !== undefined && process.env.NO_COLOR !== "";
  return {
    json: Boolean(flags.json) || !stdoutTty,
    quiet: Boolean(flags.quiet),
    color: stdoutTty && !noColor,
  };
}

export function createOutput(flags: { json?: boolean; quiet?: boolean }): Output {
  const opts = resolveOutputOptions(flags);

  function writeStdout(text: string): void {
    process.stdout.write(text.endsWith("\n") ? text : `${text}\n`);
  }
  function writeStderr(text: string): void {
    process.stderr.write(text.endsWith("\n") ? text : `${text}\n`);
  }

  return {
    opts,
    data(payload, pretty) {
      if (payload === undefined) return;
      if (opts.json || opts.quiet || !pretty) {
        writeStdout(typeof payload === "string" ? payload : JSON.stringify(payload, null, 2));
        return;
      }
      writeStdout(pretty(payload));
    },
    info(message) {
      if (opts.json || opts.quiet) return;
      writeStderr(opts.color ? pc.dim(message) : message);
    },
    success(message) {
      if (opts.json || opts.quiet) return;
      writeStderr(opts.color ? pc.green(`✓ ${message}`) : `✓ ${message}`);
    },
    error(err) {
      const structured = toStructuredError(err);
      if (opts.json) {
        writeStderr(JSON.stringify({ error: structured }, null, 2));
        return;
      }
      const lines: string[] = [];
      const head = `Error: ${structured.message}`;
      lines.push(opts.color ? pc.red(head) : head);
      const codeLine = `  code: ${structured.code}`;
      lines.push(opts.color ? pc.dim(codeLine) : codeLine);
      if (structured.hint) {
        const hintLine = `  hint: ${structured.hint}`;
        lines.push(opts.color ? pc.yellow(hintLine) : hintLine);
      }
      for (const [key, value] of Object.entries(structured)) {
        if (["code", "message", "hint"].includes(key)) continue;
        if (value === undefined || value === null) continue;
        const extra = `  ${key}: ${typeof value === "string" ? value : JSON.stringify(value)}`;
        lines.push(opts.color ? pc.dim(extra) : extra);
      }
      writeStderr(lines.join("\n"));
    },
  };
}

function toStructuredError(err: unknown): StructuredError {
  if (err instanceof GenniaCliError) {
    return err.toStructured();
  }
  if (err instanceof Error) {
    return { code: "unexpected_error", message: err.message };
  }
  return { code: "unexpected_error", message: String(err) };
}

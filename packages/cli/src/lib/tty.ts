import { createInterface } from "node:readline/promises";
import { GenniaCliError, ExitCode } from "./errors.js";

export function isInteractive(): boolean {
  return process.stdin.isTTY === true && process.stdout.isTTY === true;
}

/**
 * Read a single line from stdin in a TTY. Throws GenniaCliError(`no_tty`) when
 * called without a TTY so agents fail fast with a clear hint instead of hanging.
 */
export async function promptLine(message: string, opts: { mask?: boolean } = {}): Promise<string> {
  if (!isInteractive()) {
    throw new GenniaCliError({
      code: "no_tty",
      message: "Cannot prompt for input without a TTY.",
      exitCode: ExitCode.Usage,
      hint: "Pass the value as a flag (e.g. --api-key=gsk_...) or via env (GENNIA_API_KEY=...).",
    });
  }

  const rl = createInterface({
    input: process.stdin,
    output: process.stderr,
    terminal: true,
  });

  try {
    if (opts.mask) {
      // Best-effort masking: clear the echoed line after submit.
      const answer = await rl.question(`${message} `);
      // Move cursor up and clear the input line so the secret isn't left visible.
      process.stderr.write("\x1b[1A\x1b[2K");
      process.stderr.write(`${message} ${"*".repeat(Math.min(answer.length, 8))}\n`);
      return answer.trim();
    }
    const answer = await rl.question(`${message} `);
    return answer.trim();
  } finally {
    rl.close();
  }
}

/**
 * Confirm with y/n. Returns false if non-interactive (agents must use --yes).
 */
export async function promptConfirm(message: string, defaultYes = false): Promise<boolean> {
  if (!isInteractive()) {
    throw new GenniaCliError({
      code: "no_tty",
      message: "Cannot confirm interactively without a TTY.",
      exitCode: ExitCode.Usage,
      hint: "Re-run with --yes to skip the confirmation prompt.",
    });
  }
  const suffix = defaultYes ? "[Y/n]" : "[y/N]";
  const answer = await promptLine(`${message} ${suffix}`);
  if (!answer) return defaultYes;
  return /^y(es)?$/i.test(answer);
}

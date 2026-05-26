import { createInterface } from "node:readline/promises";
import password from "@inquirer/password";
import { GenniaCliError, ExitCode } from "./errors.js";

export function isInteractive(): boolean {
  return process.stdin.isTTY === true && process.stdout.isTTY === true;
}

/**
 * Read a single line from stdin in a TTY. Throws GenniaCliError(`no_tty`) when
 * called without a TTY so agents fail fast with a clear hint instead of hanging.
 *
 * `mask: true` delegates to `@inquirer/password`, which handles raw-mode
 * masking, bracketed-paste, and Ctrl+V paste consistently across Windows
 * Terminal/PowerShell, macOS Terminal/iTerm2, and Linux terminals. (Our
 * previous hand-rolled implementation broke paste on Windows.)
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

  if (opts.mask) {
    try {
      const answer = await password({ message, mask: "*" });
      return answer.trim();
    } catch (err) {
      // Inquirer throws ExitPromptError on Ctrl+C; mirror the previous
      // SIGINT exit code (128 + 2) so callers/scripts see the same signal.
      if (err instanceof Error && err.name === "ExitPromptError") {
        process.exit(130);
      }
      throw err;
    }
  }

  const rl = createInterface({
    input: process.stdin,
    output: process.stderr,
    terminal: true,
  });
  try {
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

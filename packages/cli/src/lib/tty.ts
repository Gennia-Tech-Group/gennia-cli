import { createInterface } from "node:readline/promises";
import { GenniaCliError, ExitCode } from "./errors.js";

export function isInteractive(): boolean {
  return process.stdin.isTTY === true && process.stdout.isTTY === true;
}

/**
 * Read a single line from stdin in a TTY. Throws GenniaCliError(`no_tty`) when
 * called without a TTY so agents fail fast with a clear hint instead of hanging.
 *
 * `mask: true` enables proper raw-mode masking (each typed/pasted character
 * shows as `*`, the real value is collected silently). Falls back to plain
 * readline when `mask` is unset.
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
    return readMaskedLine(message);
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
 * Read a line from stdin without ever echoing the real characters. Each byte
 * the user types (or pastes) is replaced with `*` on stderr. Backspace deletes
 * the last character; Ctrl-C and Ctrl-D abort.
 */
function readMaskedLine(message: string): Promise<string> {
  process.stderr.write(`${message} `);

  const stdin = process.stdin;
  const wasRaw = stdin.isRaw === true;
  stdin.setRawMode(true);
  stdin.resume();
  stdin.setEncoding("utf8");

  let collected = "";

  return new Promise<string>((resolve) => {
    const restore = () => {
      stdin.removeListener("data", onData);
      if (!wasRaw) stdin.setRawMode(false);
      stdin.pause();
    };

    const abort = (signal: number) => {
      restore();
      process.stderr.write("\n");
      process.exit(128 + signal);
    };

    const onData = (chunk: string) => {
      for (const ch of chunk) {
        const code = ch.charCodeAt(0);
        // Enter (CR or LF) — submit
        if (code === 13 || code === 10) {
          restore();
          process.stderr.write("\n");
          resolve(collected);
          return;
        }
        // Ctrl+C
        if (code === 3) {
          abort(2);
          return;
        }
        // Ctrl+D — EOF; submit whatever we have, or abort if empty
        if (code === 4) {
          if (collected.length === 0) {
            abort(15);
            return;
          }
          restore();
          process.stderr.write("\n");
          resolve(collected);
          return;
        }
        // Backspace or Delete
        if (code === 127 || code === 8) {
          if (collected.length > 0) {
            collected = collected.slice(0, -1);
            process.stderr.write("\b \b");
          }
          continue;
        }
        // Other control chars
        if (code < 32) continue;
        collected += ch;
        process.stderr.write("*");
      }
    };

    stdin.on("data", onData);
  });
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

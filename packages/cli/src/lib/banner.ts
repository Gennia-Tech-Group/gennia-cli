/**
 * GENNIA wordmark + welcome banner. Shown on `gennia --help` and after a
 * successful `gennia auth login`. Renders in cyan/blue when stdout is a TTY
 * and NO_COLOR is unset; falls back to plain text otherwise.
 *
 * Glyphs use the "ANSI Shadow" figlet style. Width is ~48 columns — fits on
 * an 80-column terminal with margin to spare.
 */
import pc from "picocolors";

const GENNIA_LINES = [
  " ██████╗ ███████╗███╗   ██╗███╗   ██╗██╗ █████╗ ",
  "██╔════╝ ██╔════╝████╗  ██║████╗  ██║██║██╔══██╗",
  "██║  ███╗█████╗  ██╔██╗ ██║██╔██╗ ██║██║███████║",
  "██║   ██║██╔══╝  ██║╚██╗██║██║╚██╗██║██║██╔══██║",
  "╚██████╔╝███████╗██║ ╚████║██║ ╚████║██║██║  ██║",
  " ╚═════╝ ╚══════╝╚═╝  ╚═══╝╚═╝  ╚═══╝╚═╝╚═╝  ╚═╝",
];

const TAGLINE = "Build agents · ship Hubs · automate workspaces";

// Brand color (#347BFA) emitted via ANSI 24-bit truecolor — all modern
// terminals (iTerm2, Terminal.app, VS Code, Alacritty, kitty, wezterm) honor
// it. Old terminals show the raw escapes; the NO_COLOR / non-TTY fallback in
// shouldUseColor() avoids that case entirely.
const GENNIA_BLUE_FG = "\x1b[38;2;52;123;250m";
const RESET_FG = "\x1b[39m";

/** Paint a string in the official Gennia brand blue (#347BFA). */
export function genniaBlue(text: string): string {
  return `${GENNIA_BLUE_FG}${text}${RESET_FG}`;
}

export interface BannerOptions {
  color?: boolean;
}

export function renderBanner(opts: BannerOptions = {}): string {
  const color = opts.color ?? false;
  const paint = (line: string) => (color ? genniaBlue(line) : line);
  const dim = (text: string) => (color ? pc.dim(text) : text);
  const lines = GENNIA_LINES.map(paint);
  lines.push("");
  lines.push(`  ${dim(TAGLINE)}`);
  return lines.join("\n");
}

export interface WelcomeOptions {
  workspacePublicId?: string;
  baseUrl?: string;
  color: boolean;
  /** Include the GENNIA wordmark above the welcome lines. */
  withBanner?: boolean;
}

export function renderWelcome(opts: WelcomeOptions): string {
  const { color, workspacePublicId, baseUrl, withBanner } = opts;
  const c = (s: string) => (color ? genniaBlue(s) : s);
  const d = (s: string) => (color ? pc.dim(s) : s);
  const bold = (s: string) => (color ? pc.bold(s) : s);

  const sections: string[] = [];
  if (withBanner) {
    sections.push(renderBanner({ color }));
    sections.push("");
  }
  sections.push(bold("Welcome to Gennia."));
  sections.push("");
  sections.push(`  ${d("Workspace:")}  ${workspacePublicId ?? d("(unknown)")}`);
  sections.push(`  ${d("API:")}        ${baseUrl ?? d("(default)")}`);
  sections.push("");
  sections.push(bold("Next steps:"));
  sections.push(`  ${c("›")} ${bold("gennia mcp install")}        ${d("plug the Gennia MCP into Claude Code, Cursor, Claude Desktop")}`);
  sections.push(`  ${c("›")} ${bold("gennia api GET /agents")}    ${d("list everything via the raw API escape hatch")}`);
  sections.push(`  ${c("›")} ${bold("gennia --help")}             ${d("full command reference")}`);
  sections.push("");
  sections.push(d("Docs: https://docs.gennia.ai"));
  return sections.join("\n");
}

export function shouldUseColor(): boolean {
  if (process.env.NO_COLOR !== undefined && process.env.NO_COLOR !== "") return false;
  return process.stdout.isTTY === true;
}

/**
 * Supported AI clients and how to find/edit their MCP server config.
 *
 * All three clients use the same JSON shape:
 *   { "mcpServers": { "<name>": { command, args, env } } }
 *
 * Codex CLI uses TOML (`~/.codex/config.toml`) and is intentionally left out of
 * v0.2.0 — landing it requires a TOML parser dependency. Documented as a known
 * gap; users can edit the file manually following the README.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { homedir, platform } from "node:os";

export type ClientId = "claude-code" | "cursor" | "claude-desktop";

export const ALL_CLIENT_IDS: ClientId[] = ["claude-code", "cursor", "claude-desktop"];

export interface ClientDescriptor {
  id: ClientId;
  displayName: string;
  /** Absolute path to the JSON config file. */
  configPath: string;
  /** Optional absolute path where a skill markdown file should land. */
  skillPath?: string;
}

export interface McpServerEntry {
  command: string;
  args: string[];
  env?: Record<string, string>;
}

export function describeClients(): ClientDescriptor[] {
  const home = homedir();
  const isMac = platform() === "darwin";
  const isWindows = platform() === "win32";

  const claudeDesktopPath = isMac
    ? join(home, "Library/Application Support/Claude/claude_desktop_config.json")
    : isWindows
      ? join(process.env.APPDATA ?? join(home, "AppData/Roaming"), "Claude/claude_desktop_config.json")
      : join(process.env.XDG_CONFIG_HOME ?? join(home, ".config"), "Claude/claude_desktop_config.json");

  return [
    {
      id: "claude-code",
      displayName: "Claude Code",
      configPath: join(home, ".claude.json"),
      skillPath: join(home, ".claude", "skills", "gennia", "SKILL.md"),
    },
    {
      id: "cursor",
      displayName: "Cursor",
      configPath: join(home, ".cursor", "mcp.json"),
      skillPath: join(home, ".cursor", "rules", "gennia.mdc"),
    },
    {
      id: "claude-desktop",
      displayName: "Claude Desktop",
      configPath: claudeDesktopPath,
    },
  ];
}

export function parseTargets(input: string | undefined): ClientId[] | "all" | "auto" {
  if (!input || input === "auto") return "auto";
  if (input === "all") return "all";
  const wanted = input.split(",").map((s) => s.trim()).filter(Boolean);
  const valid = new Set<string>(ALL_CLIENT_IDS);
  const result: ClientId[] = [];
  for (const id of wanted) {
    if (!valid.has(id)) {
      throw new Error(
        `Unknown --target value: "${id}". Valid: ${ALL_CLIENT_IDS.join(", ")}, all, auto.`,
      );
    }
    if (!result.includes(id as ClientId)) result.push(id as ClientId);
  }
  return result;
}

export interface ConfigFile {
  data: Record<string, unknown>;
  existed: boolean;
}

export function readClientConfig(path: string): ConfigFile {
  if (!existsSync(path)) return { data: {}, existed: false };
  const raw = readFileSync(path, "utf8");
  if (!raw.trim()) return { data: {}, existed: true };
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return { data: parsed as Record<string, unknown>, existed: true };
    }
    return { data: {}, existed: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`Could not parse JSON at ${path}: ${message}`);
  }
}

export function writeClientConfig(path: string, data: Record<string, unknown>): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

export function getMcpServers(config: Record<string, unknown>): Record<string, McpServerEntry> {
  const value = config.mcpServers;
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, McpServerEntry>;
  }
  return {};
}

export function setMcpServer(
  config: Record<string, unknown>,
  name: string,
  entry: McpServerEntry,
): Record<string, unknown> {
  const next = { ...config };
  const servers = { ...getMcpServers(config) };
  servers[name] = entry;
  next.mcpServers = servers;
  return next;
}

export function removeMcpServer(
  config: Record<string, unknown>,
  name: string,
): { next: Record<string, unknown>; removed: boolean } {
  const servers = getMcpServers(config);
  if (!(name in servers)) {
    return { next: config, removed: false };
  }
  const nextServers = { ...servers };
  delete nextServers[name];
  return { next: { ...config, mcpServers: nextServers }, removed: true };
}

export function entriesEqual(a: McpServerEntry | undefined, b: McpServerEntry): boolean {
  if (!a) return false;
  if (a.command !== b.command) return false;
  if (a.args.length !== b.args.length) return false;
  for (let i = 0; i < a.args.length; i += 1) {
    if (a.args[i] !== b.args[i]) return false;
  }
  const aEnv = a.env ?? {};
  const bEnv = b.env ?? {};
  const aKeys = Object.keys(aEnv).sort();
  const bKeys = Object.keys(bEnv).sort();
  if (aKeys.length !== bKeys.length) return false;
  for (let i = 0; i < aKeys.length; i += 1) {
    if (aKeys[i] !== bKeys[i]) return false;
    const key = aKeys[i];
    if (key === undefined) return false;
    if (aEnv[key] !== bEnv[key]) return false;
  }
  return true;
}

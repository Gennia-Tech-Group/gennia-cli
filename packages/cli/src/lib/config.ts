/**
 * Persistent CLI config at `$XDG_CONFIG_HOME/gennia/config.json`
 * (defaults to `~/.config/gennia/config.json`).
 *
 * Stored fields:
 *   - apiKey:           gsk_… current credential
 *   - baseUrl:          https://api.gennia.ai (or dev override)
 *   - workspacePublicId, apiKeyPublicId: cached identity from last `auth login`
 *   - updatedAt:        ISO timestamp
 *
 * Permissions: file is written with mode 0600 (owner read/write only) since it
 * contains a credential.
 */
import { mkdirSync, readFileSync, writeFileSync, existsSync, chmodSync } from "node:fs";
import { dirname, join } from "node:path";
import { homedir } from "node:os";

export interface GenniaCliConfig {
  apiKey?: string;
  baseUrl?: string;
  workspacePublicId?: string;
  apiKeyPublicId?: string;
  updatedAt?: string;
}

export function configDir(): string {
  if (process.env.GENNIA_CONFIG_DIR) {
    return process.env.GENNIA_CONFIG_DIR;
  }
  const xdg = process.env.XDG_CONFIG_HOME;
  return join(xdg ?? join(homedir(), ".config"), "gennia");
}

export function configPath(): string {
  return join(configDir(), "config.json");
}

export function loadConfig(): GenniaCliConfig {
  const path = configPath();
  if (!existsSync(path)) return {};
  try {
    const raw = readFileSync(path, "utf8");
    if (!raw.trim()) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === "object") {
      return parsed as GenniaCliConfig;
    }
    return {};
  } catch {
    // Treat unreadable/corrupt config as absent. `auth login` will overwrite it.
    return {};
  }
}

export function saveConfig(next: GenniaCliConfig): void {
  const path = configPath();
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  const payload = { ...next, updatedAt: new Date().toISOString() };
  writeFileSync(path, `${JSON.stringify(payload, null, 2)}\n`, { mode: 0o600 });
  try {
    chmodSync(path, 0o600);
  } catch {
    // Best-effort; on some filesystems chmod after write is a no-op.
  }
}

export function clearConfig(): void {
  saveConfig({});
}

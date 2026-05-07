// Token + config-dir resolution.
//
// Honors XDG_CONFIG_HOME, falls back to ~/.config (Linux/macOS convention).
// DRDEPLOY_CONFIG_DIR overrides everything for testing + CI.
//
// Token file lives at <config-dir>/token, written with mode 0600 so other
// users on a shared machine can't read it.

import { homedir } from "node:os";
import { join } from "node:path";
import { mkdir, readFile, writeFile, unlink, chmod, stat } from "node:fs/promises";

export function configDir(): string {
  const override = process.env["DRDEPLOY_CONFIG_DIR"];
  if (override && override.length > 0) return override;
  const xdg = process.env["XDG_CONFIG_HOME"];
  const base = xdg && xdg.length > 0 ? xdg : join(homedir(), ".config");
  return join(base, "drdeploy");
}

export function tokenPath(): string {
  return join(configDir(), "token");
}

export function apiHost(): string {
  return process.env["DRDEPLOY_API_HOST"] || "https://drdeploy.dev";
}

export async function readToken(): Promise<string | null> {
  try {
    const raw = await readFile(tokenPath(), "utf8");
    const trimmed = raw.trim();
    return trimmed.length > 0 ? trimmed : null;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw err;
  }
}

export async function writeToken(token: string): Promise<void> {
  const dir = configDir();
  await mkdir(dir, { recursive: true, mode: 0o700 });
  const path = tokenPath();
  await writeFile(path, token + "\n", { mode: 0o600 });
  // writeFile honors mode only on file-create. If the file already
  // existed, chmod brings it back to 0600 in case mode drifted.
  await chmod(path, 0o600);
}

export async function deleteToken(): Promise<boolean> {
  try {
    await unlink(tokenPath());
    return true;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw err;
  }
}

export async function tokenExists(): Promise<boolean> {
  try {
    await stat(tokenPath());
    return true;
  } catch {
    return false;
  }
}

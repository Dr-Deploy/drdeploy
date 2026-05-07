// `drdeploy mcp <subcommand>` — MCP integration.
//
// Subcommands:
//   serve            run the MCP server on stdio (called by AI editors)
//   install          write the right MCP config file for Claude / Cursor / Cline
//
// `serve` calls into @drdeploy/mcp's exported serve(). `install` writes
// JSON config files under the agent's config dir.

import { homedir } from "node:os";
import { join, dirname, basename, resolve } from "node:path";
import { mkdir, readFile, writeFile, lstat, rename, chmod } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import { requireToken } from "../lib/auth.ts";
import { apiHost } from "../lib/config.ts";
import { dim, green, yellow, cyan } from "../lib/fmt.ts";

export default async function mcp(args: readonly string[]): Promise<void> {
  const sub = args[0];
  switch (sub) {
    case "serve":   return await serve();
    case "install": return await install(args.slice(1));
    case undefined:
    case "--help":
    case "-h":
      printHelp();
      return;
    default:
      console.error(`unknown mcp subcommand: ${sub}`);
      console.error("run `drdeploy mcp --help`");
      process.exit(1);
  }
}

function printHelp(): void {
  console.log(`drdeploy mcp — Model Context Protocol integration

USAGE
  drdeploy mcp <subcommand>

SUBCOMMANDS
  serve                    run the MCP server on stdio. Invoked by AI
                           editors; you don't normally run this manually
  install --client <name>  write MCP config for the given agent
                           (claude | cursor | cline)
  install                  alias for --client claude
`);
}

async function serve(): Promise<void> {
  const token = await requireToken();
  // Lazy-import so the install path doesn't pay the SDK boot cost.
  const { serve: doServe } = await import("@drdeploy/mcp/serve");
  await doServe({ token, apiHost: apiHost() });
}

async function install(rest: readonly string[]): Promise<void> {
  const client = parseClientArg(rest);
  const cfg = clientConfig(client);

  // Make sure the user has a token before we wire MCP up — the agent
  // would just see "Not signed in" otherwise. We don't read the token,
  // we just check it exists.
  await requireToken();

  await ensureMcpEntry(cfg);

  console.log("");
  console.log(`${green("✓")} Wrote ${cyan(cfg.label)} config: ${dim(cfg.path)}`);
  console.log("");
  console.log(`  Restart ${cfg.label} to pick up the change. The agent will see`);
  console.log(`  ${cfg.label === "Claude Desktop" ? 4 : "the four"} drdeploy tools (list_sites, scan, get_findings, get_status).`);
  console.log("");
}

// ─── Per-client config ───────────────────────────────────────────────

interface ClientConfig {
  label: string;
  path: string;
  /** "Standard" MCP servers config (Claude Desktop / Cline). Keys live
   *  under `mcpServers` in the JSON. Cursor uses a different key under
   *  some versions; we keep that as a TODO. */
  topLevelKey: string;
}

function clientConfig(client: "claude" | "cursor" | "cline"): ClientConfig {
  switch (client) {
    case "claude":
      // Claude Desktop config path differs by OS — see anthropic docs
      return {
        label:       "Claude Desktop",
        path:        join(claudeDesktopConfigDir(), "claude_desktop_config.json"),
        topLevelKey: "mcpServers"
      };
    case "cursor":
      return {
        label:       "Cursor",
        path:        join(homedir(), ".cursor", "mcp.json"),
        topLevelKey: "mcpServers"
      };
    case "cline":
      // Cline (formerly Claude Dev) reads from a settings JSON inside
      // the VS Code globalStorage tree. The exact path varies by OS,
      // but the conventional override path is ~/.cline/mcp_settings.json.
      return {
        label:       "Cline",
        path:        join(homedir(), ".cline", "mcp_settings.json"),
        topLevelKey: "mcpServers"
      };
  }
}

function claudeDesktopConfigDir(): string {
  if (process.platform === "darwin") {
    return join(homedir(), "Library", "Application Support", "Claude");
  }
  if (process.platform === "win32") {
    return join(process.env["APPDATA"] ?? homedir(), "Claude");
  }
  // Linux — Claude Desktop has experimental Linux support; convention is
  // ~/.config/Claude. Falls back gracefully if the user picks a different one.
  return join(homedir(), ".config", "Claude");
}

function parseClientArg(rest: readonly string[]): "claude" | "cursor" | "cline" {
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i];
    if (a === "--client" || a === "-c") {
      const v = rest[i + 1];
      if (v === "claude" || v === "cursor" || v === "cline") return v;
      console.error(`Unknown client '${v ?? ""}'. Pick one of: claude, cursor, cline`);
      process.exit(1);
    }
  }
  // Default = Claude Desktop, the most common drdeploy use case
  return "claude";
}

// ─── JSON merge ──────────────────────────────────────────────────────

interface McpEntry {
  command: string;
  args: string[];
}

/**
 * Build the MCP server entry to write into the agent's config.
 *
 * Two modes:
 *   - Compiled binary (`bun build --compile`): process.execPath IS the
 *     drdeploy binary, which has `mcp serve` as a subcommand. Emit
 *     { command: drdeploy, args: ["mcp", "serve"] }.
 *   - Dev (`bun run src/index.ts mcp install`): process.execPath is the
 *     bun runtime — bun has no `mcp` subcommand. Emit
 *     { command: bun, args: ["run", <abs path to src/index.ts>, "mcp", "serve"] }.
 *
 * Detection: in compiled binaries, Bun loads sources from a virtual FS
 * mounted at `/$bunfs/`, so `import.meta.path` starts with that prefix.
 * In dev, it's a real filesystem path. (`Bun.embeddedFiles.length` is
 * unreliable — empirically 0 even for compiled binaries.)
 */
export function mcpServerEntry(): McpEntry {
  if (isCompiledBinary()) {
    return {
      command: process.execPath,
      args:    ["mcp", "serve"]
    };
  }
  // Dev mode: resolve the CLI entry relative to THIS file's location, not
  // cwd of `bun run` (which can be anywhere).
  // `commands/mcp.ts` -> entry is `../index.ts`.
  const entry = resolve(import.meta.dir, "..", "index.ts");
  return {
    command: process.execPath,
    args:    ["run", entry, "mcp", "serve"]
  };
}

function isCompiledBinary(): boolean {
  return import.meta.path.startsWith("/$bunfs/");
}

async function ensureMcpEntry(cfg: ClientConfig): Promise<void> {
  const existing = await readJsonOrEmpty(cfg.path);

  // Refuse non-plain-object roots and non-plain-object mcpServers
  // values. Without this, `mcpServers: []` would silently get treated
  // as an object, the new drdeploy key would be stringified as a
  // numeric-index property, and JSON.stringify would drop it while
  // we report success — a quiet failure mode flagged by /codex review.
  if (existing != null && !isPlainObject(existing)) {
    throw new Error(`Refusing to merge: ${cfg.path} root is not a JSON object.`);
  }
  const root = (existing as Record<string, unknown> | null) ?? {};

  const existingServers = root[cfg.topLevelKey];
  if (existingServers != null && !isPlainObject(existingServers)) {
    throw new Error(`Refusing to merge: ${cfg.path} ${cfg.topLevelKey} is not a JSON object.`);
  }
  const servers = (existingServers as Record<string, McpEntry> | null) ?? {};

  servers["drdeploy"] = mcpServerEntry();
  root[cfg.topLevelKey] = servers;

  await mkdir(dirname(cfg.path), { recursive: true });
  await atomicWriteJson(cfg.path, root);
}

// Atomic + symlink-safe write. Refuses to overwrite a symlink at the
// target path (so `~/.cursor/mcp.json -> /etc/passwd` won't be smashed
// by us writing user-controlled JSON to it). Writes via temp file in
// the same directory + rename so a partial write can't leave a corrupt
// config behind. New files get mode 0600; existing regular files keep
// their mode.
async function atomicWriteJson(path: string, data: unknown): Promise<void> {
  const dir = dirname(path);
  let preserveMode: number | null = null;

  try {
    const info = await lstat(path);
    if (info.isSymbolicLink()) {
      throw new Error(
        `Refusing to write: ${path} is a symlink. Remove or relocate it, then re-run.`
      );
    }
    if (info.isFile()) {
      preserveMode = info.mode & 0o777;
    }
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
  }

  // Random suffix avoids racing parallel installs on the same path.
  const tmpPath = join(dir, `.${basename(path)}.${randomBytes(6).toString("hex")}.tmp`);
  await writeFile(tmpPath, JSON.stringify(data, null, 2) + "\n", { mode: 0o600 });
  await chmod(tmpPath, preserveMode ?? 0o600);
  await rename(tmpPath, path);
}

async function readJsonOrEmpty(path: string): Promise<unknown> {
  try {
    const info = await lstat(path);
    if (info.isSymbolicLink()) {
      throw new Error(`Refusing to read: ${path} is a symlink. Remove or relocate it, then re-run.`);
    }
    if (!info.isFile()) {
      return null;
    }
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw err;
  }
  try {
    const raw = await readFile(path, "utf8");
    return raw.trim().length === 0 ? null : JSON.parse(raw);
  } catch (err) {
    console.error(yellow(`Warning: existing config at ${path} isn't valid JSON; bailing.`));
    throw err;
  }
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v) && Object.getPrototypeOf(v) === Object.prototype;
}

// Regression test for the dev-mode bug in `drdeploy mcp install`.
//
// In dev (`bun run src/index.ts mcp install`), process.execPath is the bun
// runtime. Writing { command: process.execPath, args: ["mcp", "serve"] } to
// the agent's MCP config produces `bun mcp serve`, which fails because bun
// has no `mcp` subcommand. The fix detects compiled-binary mode via
// `import.meta.path.startsWith("/$bunfs/")` and, in dev, emits
// `["run", <absolute entry path>, "mcp", "serve"]`.

import { describe, expect, test } from "bun:test";
import { resolve } from "node:path";
import { mcpServerEntry } from "./mcp.ts";

describe("mcpServerEntry()", () => {
  test("dev mode: emits bun-run wrapper with absolute CLI entry path", () => {
    // This test always runs under `bun test`, i.e. dev mode — never
    // compiled. So we assert the dev-mode shape directly.
    const entry = mcpServerEntry();

    // Command is the bun runtime (whatever execPath happens to be in
    // this environment). We just assert it's an absolute path.
    expect(entry.command).toBe(process.execPath);
    expect(entry.command.startsWith("/")).toBe(true);

    // First two args must wrap the entry path so the agent runs
    // `bun run <entry> mcp serve`, not `bun mcp serve`.
    expect(entry.args[0]).toBe("run");
    expect(entry.args.slice(2)).toEqual(["mcp", "serve"]);

    // Entry path must be absolute and resolve to src/index.ts —
    // resolved relative to this file's directory, not cwd.
    const entryPath = entry.args[1]!;
    expect(entryPath.startsWith("/")).toBe(true);
    expect(entryPath).toBe(resolve(import.meta.dir, "..", "index.ts"));
  });
});

# `drdeploy` MCP server

Exposes drdeploy capabilities as a [Model Context Protocol](https://modelcontextprotocol.io)
server so AI editors (Claude Code, Cursor, Cline, Continue, …) can call
into your monitored sites without leaving the IDE.

## Tools surfaced

```
drdeploy.list_sites              → array of {host, environment, plan, last_scan}
drdeploy.scan(url)               → triggers a scan, returns scan_id
drdeploy.get_findings(scan_id)   → latest findings, severity-grouped
drdeploy.get_status(host)        → uptime + cert + last-finding summary
drdeploy.watch(host)             → start watching a host (subscribable)
```

Each tool maps 1:1 to a `/api/v1/*` endpoint on the Rails app. The MCP
layer is auth-scoped to the user's local CLI token (`~/.config/drdeploy/token`)
— it never asks the agent for credentials.

## Transports

- **stdio** (default) — `drdeploy mcp serve` from the CLI binary runs this.
  Used by Claude Code, Cursor, etc.
- **http** (planned) — a long-running daemon for browser-based agents.
  Not built yet.

## Install for an agent

```bash
drdeploy mcp install --client claude     # writes ~/.claude/mcp_servers.json
drdeploy mcp install --client cursor     # writes ~/.cursor/mcp.json
drdeploy mcp install --client cline      # writes ~/.cline/mcp_settings.json
```

Each command writes the right config file with the right command +
args invocation, then prints what it did.

## Why this lives in `sdk/mcp/`

The MCP server is its own package because:
1. **Test isolation** — the protocol layer can be unit-tested without
   the CLI shell parsing in the way.
2. **Future standalone publish** — if MCP catches on outside of editor
   embedding (Slack bots, headless agents, CI runners), we may publish
   `@drdeploy/mcp` on npm independently of the CLI.
3. **Type sharing** — the MCP tool definitions are the source of truth
   for what the CLI exposes too.

The CLI imports it as `@drdeploy/mcp` (workspace-linked) and bundles it
into the single binary at compile time.

## Build

```bash
bun install
bun run build              # → bundle for inclusion in the CLI binary
bun run typecheck
```

## Spec source

`/api/v1/openapi.json` on the Rails app is the contract. The MCP tool
definitions are generated from it — re-run `bun run regen-tools`
whenever the OpenAPI spec changes.

# `drdeploy` CLI

Single static binary. Talks to `drdeploy.dev` via the Bearer-token API.

## What it does

```
drdeploy login                    # OAuth 2.0 device flow → get a token
drdeploy logout                   # revoke local token
drdeploy add <url>                # register a new site
drdeploy list                     # list sites under the current workspace
drdeploy scan <url>               # trigger a scan (or scan the last-added)
drdeploy status                   # health + last-check timestamps
drdeploy watch [url]              # daemon — re-scan on git push
drdeploy mcp serve                # run the embedded MCP server (stdio transport)
drdeploy mcp install              # write MCP config for Claude / Cursor / Cline
drdeploy --version
```

## Backend the CLI consumes

Already shipped in the Rails app:

- `POST /api/v1/auth/device/start` — RFC 8628 device flow start
- `POST /api/v1/auth/device/token` — poll until user approves
- `GET  /api/v1/sites`              — list
- `GET  /api/v1/sites/:id`          — show
- `POST /api/v1/sites/:id/scan`     — scan
- `GET  /api/v1/openapi.json`       — full spec (CLI uses this for self-update / typegen)

All Bearer-token authed via `Authorization: Bearer ddp_<32 bytes>`.

## Token storage

`~/.config/drdeploy/token` (mode 0600). Path can be overridden with
`DRDEPLOY_CONFIG_DIR`.

## Build

```bash
bun install
bun run build              # → ./bin/drdeploy (current platform)
bun run build:all          # → ./bin/drdeploy-{darwin-arm64,darwin-x64,linux-arm64,linux-x64}
```

## Distribution

Plan:
1. GitHub Releases — upload the four platform binaries
2. Homebrew tap (`pghqdev/drdeploy`) — formula points at the latest release
3. `https://drdeploy.dev/install.sh` — sniffs `uname -sm`, downloads the right binary, drops it in `/usr/local/bin/drdeploy`

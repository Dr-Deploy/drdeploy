# Dr.Deploy

A live monitor for shipped websites. Watches your live URL and catches the embarrassing things you didn't notice — leaked API keys, broken og:image, missing favicons, exposed `.env` files, security header gaps. Within seconds of every deploy.

This repo is the public source for everything that runs **outside** the [Dr.Deploy service](https://drdeploy.dev): the CLI, the MCP server, and the Claude Code skills.

## What's here

| Package | What it is | Install |
|---|---|---|
| [`@drdeploy/cli`](./packages/cli) | `drdeploy` command-line tool. Single static binary. macOS + Linux. | `npm i -g @drdeploy/cli` or `curl -fsSL drdeploy.dev/install \| sh` |
| [`@drdeploy/mcp`](./packages/mcp) | Model Context Protocol server. Bundled into the CLI binary; published separately for non-CLI MCP use cases. | `npm i @drdeploy/mcp` |
| [`@drdeploy/skills`](./packages/skills) | Claude Code / Cursor / Cline skills. Drops `SKILL.md` files + downloads the binary + adds drdeploy routing to `CLAUDE.md`. | `npx @drdeploy/skills setup` |

## Install paths

The same product, six surfaces:

```bash
# Default (any OS, any user)
curl -fsSL https://drdeploy.dev/install | sh

# Mac power users
brew install dr-deploy/tap/drdeploy

# Node ecosystem devs
npm install -g @drdeploy/cli

# Claude Code / AI-editor users
npx @drdeploy/skills setup

# Claude Code (native plugin marketplace)
> /plugin marketplace add Dr-Deploy/drdeploy
> /plugin install drdeploy

# Direct download (Windows + manual installs)
# https://github.com/Dr-Deploy/drdeploy/releases/latest
```

### MCP server (for AI editors)

```bash
# Standalone via npm:
DRDEPLOY_TOKEN=$(cat ~/.config/drdeploy/token) npx @drdeploy/mcp

# Or bundled in the CLI binary:
drdeploy mcp install --client claude    # writes ~/.claude/mcp_servers.json
drdeploy mcp install --client cursor    # writes ~/.cursor/mcp.json
drdeploy mcp install --client cline     # writes ~/.cline/mcp_settings.json
```

The MCP server is also published to the [official MCP Registry](https://registry.modelcontextprotocol.io/) at `io.github.dr-deploy/drdeploy-mcp`, which means it's discoverable from Smithery, mcp.so, and any other MCP-aware client that pulls from the canonical registry.

## What does it actually catch

- Leaked API keys in your live JS bundle (OpenAI `sk-*`, Anthropic `sk-ant-*`, Stripe `sk_live_*`, AWS `AKIA*`, GitHub `ghp_*`, Slack `xoxb-*`)
- Broken or missing og:image, twitter:card, favicon
- Exposed `.env`, `.git/config`, `.DS_Store` at common paths
- Missing security headers (CSP, HSTS, X-Frame-Options)
- TLS issues (expiring certs, weak ciphers, mixed content)
- Title / meta description truncation, broken canonical URLs
- 37+ checks across 7 categories. Full list in [drdeploy.dev/checks](https://drdeploy.dev/checks).

## Usage

```bash
$ drdeploy login
$ drdeploy add example.com
$ drdeploy scan example.com
✓ Scan queued (run #1247)
  Watch progress on the dashboard or rerun: drdeploy scan example.com
```

For Claude Code / Cursor / Cline:

```
$ npx @drdeploy/skills setup
✓ drdeploy CLI 0.1.0 installed
✓ Wrote ~/.claude/skills/drdeploy/SKILL.md
? Append drdeploy routing rules to CLAUDE.md? (Y/n)

# Now in your AI editor:
> /drdeploy scan myapp.com
```

## Development

```bash
git clone https://github.com/Dr-Deploy/drdeploy.git
cd drdeploy
bun install
bun run typecheck
bun test
```

This is a Bun workspace. Each package has its own `package.json` and TS config extending [`tsconfig.base.json`](./tsconfig.base.json).

### Building the CLI binary

```bash
cd packages/cli
bun run build           # current platform → ./dist/drdeploy
bun run build:all       # all 4 platforms → ./dist/drdeploy-{darwin,linux}-{arm64,x64}
```

## Releases

Releases are managed via [Changesets](https://github.com/changesets/changesets). To propose a release:

```bash
bun run changeset       # interactive: pick packages + bump type + write changelog
git commit -am "chore: release"
# Open PR. Merge. Tag. CI builds binaries + publishes to npm.
```

## License

MIT. See [LICENSE](./LICENSE).

## Links

- Service: https://drdeploy.dev
- Docs: https://drdeploy.dev/docs
- Issues: https://github.com/Dr-Deploy/drdeploy/issues
- Status: https://drdeploy.dev/status

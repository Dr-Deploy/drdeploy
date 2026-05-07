// `drdeploy-mcp` — npx-invokable entry point for the standalone MCP server.
//
// Reads DRDEPLOY_TOKEN + DRDEPLOY_API_HOST from env, hands off to serve()
// from ./serve.ts. Stdio transport, blocking until the agent disconnects.
//
// Why a separate entry from src/index.ts: index.ts is the library export
// (consumers `import { serve } from '@drdeploy/mcp'`). bin.ts is the CLI
// shim that knows how to read its own env and emit usage on missing creds.
// Keeping them split means the library import doesn't pull console.log /
// process.exit into a consumer's process tree.

import { serve } from "./serve.ts";

const token = process.env.DRDEPLOY_TOKEN;
const apiHost = process.env.DRDEPLOY_API_HOST ?? "https://drdeploy.dev";

if (!token) {
  console.error("✗ DRDEPLOY_TOKEN is not set.");
  console.error("");
  console.error("Get a token by signing in to https://drdeploy.dev and");
  console.error("running `drdeploy login` (creates ~/.config/drdeploy/token),");
  console.error("then export it for this MCP server:");
  console.error("");
  console.error("  export DRDEPLOY_TOKEN=$(cat ~/.config/drdeploy/token)");
  console.error("");
  process.exit(1);
}

serve({ token, apiHost }).catch((err: unknown) => {
  console.error("✗ MCP server crashed:", err instanceof Error ? err.message : String(err));
  process.exit(1);
});

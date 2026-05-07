// Public entrypoint for the @drdeploy/mcp package.
//
// The CLI imports `serve` to run the MCP server on stdio when the user
// runs `drdeploy mcp serve`. Tool definitions live in ./tools.ts so they
// can be regenerated from the Rails app's /api/v1/openapi.json without
// touching the serve plumbing.

export { serve } from "./serve.ts";
export { toolSchemas } from "./tools.ts";
export type { ToolName } from "./tools.ts";

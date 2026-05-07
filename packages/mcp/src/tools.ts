// MCP tool definitions for drdeploy.
//
// Each entry here corresponds 1:1 to a /api/v1/* endpoint on the Rails
// app and is registered with the McpServer in serve.ts. Schemas are
// Zod raw-shapes — `@modelcontextprotocol/sdk` accepts them natively
// and auto-derives JSON Schema for the protocol.

import { z } from "zod";

export const toolSchemas = {
  drdeploy_list_sites: {
    title:       "List monitored sites",
    description: "List all sites the current workspace is monitoring. Returns one row per site with host, environment, verified-ness, and last-scan timestamp.",
    inputSchema: {}
  },

  drdeploy_scan: {
    title:       "Trigger a scan",
    description: "Trigger a scan on a registered site. The site must already be added (use drdeploy_list_sites to find it). Returns scan_run_id immediately; results land in drdeploy_get_findings once the scan completes.",
    inputSchema: {
      host: z.string().min(1).describe("Site host to scan, e.g. 'example.com'. Must already be added in this workspace.")
    }
  },

  drdeploy_get_findings: {
    title:       "Get latest scan findings",
    description: "Fetch the most-recent completed scan for a site, with severity counts (critical / warn / info / ok). Use to diagnose what's broken right now.",
    inputSchema: {
      host: z.string().min(1).describe("Site host whose latest findings you want.")
    }
  },

  drdeploy_get_status: {
    title:       "Get site status",
    description: "Service health + last-scan timestamp + verified-ness for a single site. Lighter-weight than get_findings — for quick 'is X currently healthy?' checks.",
    inputSchema: {
      host: z.string().min(1).describe("Site host to check.")
    }
  }
} as const;

export type ToolName = keyof typeof toolSchemas;

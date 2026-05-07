// MCP server boot — stdio transport.
//
// Boots a McpServer with the four drdeploy tools registered in
// ./tools.ts. Each handler uses ./api.ts to talk to /api/v1/* with the
// caller-provided bearer token. Returns content as Markdown text — the
// MCP spec lets us emit structured content too, but Markdown keeps
// agent-side rendering predictable across Claude / Cursor / Cline / etc.

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { makeClient, McpApiError, type ApiClient, type Site, type SiteDetail } from "./api.ts";
import { toolSchemas } from "./tools.ts";

export interface ServeOptions {
  /** Bearer token to auth /api/v1/* calls. */
  token: string;
  /** API host base (e.g. "https://drdeploy.dev"). */
  apiHost: string;
  /** Server name surfaced in the MCP handshake. */
  name?: string;
  /** Server version surfaced in the MCP handshake. */
  version?: string;
}

import pkg from "../package.json" with { type: "json" };
const VERSION = pkg.version;

/**
 * Start the MCP server on stdio. Resolves once the underlying transport
 * connection closes (i.e. the agent disconnects).
 */
export async function serve(opts: ServeOptions): Promise<void> {
  const server = new McpServer({
    name:    opts.name    ?? "drdeploy",
    version: opts.version ?? VERSION
  });

  const api = makeClient({ token: opts.token, apiHost: opts.apiHost });

  registerListSites(server, api);
  registerScan(server, api);
  registerGetFindings(server, api);
  registerGetStatus(server, api);

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

// ─── Tool registrations ──────────────────────────────────────────────

function registerListSites(server: McpServer, api: ApiClient): void {
  const t = toolSchemas.drdeploy_list_sites;
  // Intentionally omit inputSchema — agents often send tools/call
  // without an `arguments` key for zero-arg tools, and the SDK
  // validates undefined against z.object({}) which rejects with
  // "Invalid arguments". Omitting the schema lets any args (including
  // none at all) through.
  server.registerTool(
    "drdeploy_list_sites",
    { title: t.title, description: t.description },
    async (extra) => {
      try {
        const data = await api.listSites(extra?.signal);
        if (data.sites.length === 0) {
          return text(`Workspace **${data.workspace.name}** (${data.workspace.plan_key}) has no sites yet. Use \`drdeploy_scan\` after adding one.`);
        }
        const rows = data.sites.map(formatSiteRow).join("\n");
        return text(`Workspace **${data.workspace.name}** (${data.workspace.plan_key})\n\n${rows}`);
      } catch (err) {
        return errorText(err);
      }
    }
  );
}

function registerScan(server: McpServer, api: ApiClient): void {
  const t = toolSchemas.drdeploy_scan;
  server.registerTool(
    "drdeploy_scan",
    { title: t.title, description: t.description, inputSchema: t.inputSchema },
    async ({ host }, extra) => {
      try {
        const site = await resolveSite(api, host, extra?.signal);
        if (!site) return text(`No site matching '${host}' is registered in this workspace.`);
        // Re-check cancellation before the side-effecting POST. resolveSite's
        // listSites is idempotent; scanSite enqueues a job — bail late if
        // the agent canceled us between calls.
        extra?.signal?.throwIfAborted?.();
        const res = await api.scanSite(site.id, extra?.signal);
        return text(`Scan ${res.ok ? "queued" : "rejected"}: ${res.message}${res.scan_run_id ? ` (run #${res.scan_run_id})` : ""}`);
      } catch (err) {
        return errorText(err);
      }
    }
  );
}

function registerGetFindings(server: McpServer, api: ApiClient): void {
  const t = toolSchemas.drdeploy_get_findings;
  server.registerTool(
    "drdeploy_get_findings",
    { title: t.title, description: t.description, inputSchema: t.inputSchema },
    async ({ host }, extra) => {
      try {
        const site = await resolveSite(api, host, extra?.signal);
        if (!site) return text(`No site matching '${host}' is registered in this workspace.`);
        const detail = await api.showSite(site.id, extra?.signal);
        return text(formatFindings(detail));
      } catch (err) {
        return errorText(err);
      }
    }
  );
}

function registerGetStatus(server: McpServer, api: ApiClient): void {
  const t = toolSchemas.drdeploy_get_status;
  server.registerTool(
    "drdeploy_get_status",
    { title: t.title, description: t.description, inputSchema: t.inputSchema },
    async ({ host }, extra) => {
      try {
        const site = await resolveSite(api, host, extra?.signal);
        if (!site) return text(`No site matching '${host}' is registered in this workspace.`);
        const detail = await api.showSite(site.id, extra?.signal);
        return text(formatStatus(detail));
      } catch (err) {
        return errorText(err);
      }
    }
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────

async function resolveSite(api: ApiClient, host: string, signal?: AbortSignal): Promise<Site | null> {
  const wanted = normalizeHost(host);
  if (wanted == null) return null;
  const data = await api.listSites(signal);
  return data.sites.find((s) => normalizeHost(s.host) === wanted) ?? null;
}

// Match the CLI's lib/url.ts policy: lowercase, strip trailing dot,
// reject userinfo + non-http(s) schemes. Returns null for inputs we
// refuse to consider rather than throwing — the agent gets a clean
// "no site matching" reply instead of a stack trace.
function normalizeHost(input: string): string | null {
  const trimmed = input.trim();
  if (trimmed.length === 0 || trimmed.length > 1024) return null;
  const looksAbsolute = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed);
  const candidate = looksAbsolute ? trimmed : `https://${trimmed}`;
  let parsed: URL;
  try { parsed = new URL(candidate); } catch { return null; }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
  if (parsed.username.length > 0 || parsed.password.length > 0) return null;
  if (parsed.hostname.length === 0) return null;
  return parsed.hostname.toLowerCase().replace(/\.$/, "");
}

function formatSiteRow(s: Site): string {
  const verified = s.verified ? "✓" : "pending";
  const last = s.last_scanned_at ?? "never";
  return `- **${s.host}** · ${s.environment} · verified=${verified} · last_scan=${last}`;
}

function formatFindings(d: SiteDetail): string {
  const lines: string[] = [];
  lines.push(`# ${d.host}`);
  if (!d.latest_run) {
    lines.push("\nNo completed scans yet. Trigger one with `drdeploy_scan`.");
    return lines.join("\n");
  }
  const r = d.latest_run;
  lines.push(`\n**Latest run #${r.id}** · severity=${r.severity ?? "n/a"} · finished ${r.finished_at ?? "n/a"}`);
  lines.push("");
  lines.push(`| severity | count |`);
  lines.push(`|---|---|`);
  lines.push(`| critical | ${r.critical} |`);
  lines.push(`| warn     | ${r.warn} |`);
  lines.push(`| info     | ${r.info} |`);
  lines.push(`| ok       | ${r.ok} |`);
  if (r.public_url) lines.push(`\nPublic report: ${r.public_url}`);
  return lines.join("\n");
}

function formatStatus(d: SiteDetail): string {
  const verified = d.verified ? "verified" : "pending verification";
  const last = d.last_scanned_at ?? "never scanned";
  const sev = d.latest_run?.severity ?? "no run yet";
  return `**${d.host}** — ${verified}, last scan: ${last}, severity: ${sev}`;
}

function text(markdown: string) {
  return { content: [{ type: "text" as const, text: markdown }] };
}

// Map server error codes to STATIC messages — never forward arbitrary
// `body.error.message` into the agent transcript. A compromised
// drdeploy.dev could otherwise craft an error.message like
// "Token <ddp_…>" that leaks the bearer token into the agent's context.
// Belt + suspenders: also scrub any string we DO emit for ddp_… shaped
// tokens before sending to the agent.
const KNOWN_API_CODES: Record<string, string> = {
  unauthorized:      "Token rejected by the server. Run `drdeploy login` again.",
  forbidden:         "Not allowed: this account / plan can't perform that action.",
  not_found:         "That site or run doesn't exist (or is no longer in this workspace).",
  validation_failed: "The site couldn't be created — its host or configuration was rejected.",
  site_unverified:   "Site hasn't completed ownership verification yet."
};

function errorText(err: unknown) {
  if (err instanceof McpApiError) {
    const body = err.body as { error?: { code?: string } } | null;
    const code = body?.error?.code;
    const friendly = (code && KNOWN_API_CODES[code]) || `Server returned status ${err.status}.`;
    return text(scrubTokens(`Error: ${friendly}`));
  }
  return text(scrubTokens(`Error: ${err instanceof Error ? err.message : String(err)}`));
}

// Bearer-token shape: `ddp_<urlsafe-base64-of-32-bytes>`. Replace any
// occurrence with a redaction marker so a token can't ride out via an
// error path even if upstream code accidentally interpolates it.
function scrubTokens(s: string): string {
  return s.replace(/\bddp_[A-Za-z0-9_-]{20,}/g, "ddp_<redacted>");
}

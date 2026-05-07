// Minimal HTTP client used by tool handlers in serve.ts.
//
// Deliberately kept distinct from sdk/cli/src/lib/api.ts so the MCP
// package has no upward dependency on the CLI package. The shapes are
// the same on the wire — both client and CLI consume /api/v1/*.

export interface ApiClient {
  listSites(signal?: AbortSignal): Promise<ListResponse>;
  showSite(id: number, signal?: AbortSignal): Promise<SiteDetail>;
  scanSite(id: number, signal?: AbortSignal): Promise<ScanResponse>;
}

export interface Site {
  id: number;
  host: string;
  environment: string;
  host_provider: string | null;
  framework: string | null;
  verified: boolean;
  share_enabled: boolean;
  last_scanned_at: string | null;
}

export interface ListResponse {
  workspace: { id: number; name: string; plan_key: string };
  sites: Site[];
}

export interface SiteDetail extends Site {
  latest_run?: {
    id: number;
    status: string;
    severity: string | null;
    critical: number;
    warn: number;
    info: number;
    ok: number;
    finished_at: string | null;
    public_url: string | null;
  } | null;
}

export interface ScanResponse {
  ok: boolean;
  scan_run_id: number | null;
  message: string;
}

export class McpApiError extends Error {
  constructor(message: string, public readonly status: number, public readonly body: unknown) {
    super(message);
    this.name = "McpApiError";
  }
}

export function makeClient(opts: { token: string; apiHost: string }): ApiClient {
  const headers: Record<string, string> = {
    Accept:        "application/json",
    "Content-Type": "application/json",
    Authorization: `Bearer ${opts.token}`,
    "User-Agent":  "drdeploy-mcp/0.0.0"
  };

  // 30s default timeout. Combined with caller-provided AbortSignal via
  // AbortSignal.any so cancellation from EITHER source aborts the fetch.
  // Without this, a hung server could leave tool calls running after
  // the agent canceled them.
  const DEFAULT_TIMEOUT_MS = 30_000;

  async function fetchJson<T>(method: string, path: string, signal?: AbortSignal): Promise<T> {
    const url = new URL(path, opts.apiHost).toString();
    const timeoutCtl = new AbortController();
    const timer = setTimeout(() => timeoutCtl.abort(new Error("request timed out")), DEFAULT_TIMEOUT_MS);
    const combined = signal ? AbortSignal.any([timeoutCtl.signal, signal]) : timeoutCtl.signal;
    try {
      const res = await fetch(url, { method, headers, signal: combined });
      const text = await res.text();
      let body: unknown = null;
      if (text.length > 0) {
        try { body = JSON.parse(text); } catch { body = text; }
      }
      if (!res.ok) {
        throw new McpApiError(`${res.status} ${res.statusText} on ${method} ${path}`, res.status, body);
      }
      return body as T;
    } finally {
      clearTimeout(timer);
    }
  }

  return {
    listSites: (signal) => fetchJson<ListResponse>("GET", "/api/v1/sites", signal),
    showSite:  (id, signal) => fetchJson<SiteDetail>("GET", `/api/v1/sites/${id}`, signal),
    scanSite:  (id, signal) => fetchJson<ScanResponse>("POST", `/api/v1/sites/${id}/scan`, signal)
  };
}

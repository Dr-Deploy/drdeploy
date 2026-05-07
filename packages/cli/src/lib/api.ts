// Thin wrapper around fetch() for /api/v1/* calls.
//
// - Resolves the API host from DRDEPLOY_API_HOST (defaults to drdeploy.dev)
// - Sets Content-Type + Accept to JSON
// - Adds Bearer auth if a token is provided
// - Returns the parsed response body OR throws ApiError for non-2xx that
//   don't carry an OAuth-shaped `error` field. Device-flow polling
//   endpoints return 400 with `{error: "authorization_pending"}` as a
//   normal-flow signal — the caller handles those without an exception.
// - Validates the parsed body against a valibot schema. Mismatch throws
//   SchemaValidationError with an "upgrade your CLI" hint, so server-side
//   deploy skew (renamed key, type drift, missing field) fails loud at the
//   network boundary rather than silently rendering `undefined` mid-output.

import * as v from "valibot";
import { apiHost } from "./config.ts";

export interface ApiOptions {
  token?: string;
  /** When true, treat 4xx with JSON body as a successful return value
   *  rather than throwing. Used by the device-flow token poll. */
  passthroughClientErrors?: boolean;
}

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly body: unknown
  ) {
    super(message);
    this.name = "ApiError";
  }
}

/**
 * Thrown when a server response parses as JSON but doesn't match the
 * schema the CLI expects. Almost always means the server has shipped a
 * newer (or much older) API contract than this CLI build knows about.
 *
 * The message tells the user to upgrade and includes the schema-mismatch
 * issue summary so dev-mode debugging stays tractable.
 */
export class SchemaValidationError extends Error {
  constructor(
    public readonly path: string,
    public readonly issues: string,
    public readonly body: unknown
  ) {
    super(
      `Server returned unexpected response shape for ${path} — your CLI may be out of date.\n` +
      `  Run \`drdeploy upgrade\` or: curl -fsSL https://drdeploy.dev/install.sh | sh\n` +
      `  Validation issues:\n${issues}`
    );
    this.name = "SchemaValidationError";
  }
}

/** A valibot BaseSchema generic param — we only need the inferred OUT
 *  type for the wrapper return, so the constraint is intentionally loose. */
export type ResponseSchema<T> = v.BaseSchema<unknown, T, v.BaseIssue<unknown>>;

export async function postJson<T>(
  path: string,
  body: Record<string, unknown>,
  schema: ResponseSchema<T>,
  opts?: ApiOptions
): Promise<T>;
export async function postJson<T>(
  path: string,
  body: Record<string, unknown>,
  schema: ResponseSchema<T>,
  opts: ApiOptions = {}
): Promise<T> {
  const url = new URL(path, apiHost()).toString();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json",
    "User-Agent": userAgent()
  };
  if (opts.token) headers["Authorization"] = `Bearer ${opts.token}`;

  const res = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body)
  });

  const text = await res.text();
  let parsed: unknown = null;
  if (text.length > 0) {
    try { parsed = JSON.parse(text); } catch { parsed = text; }
  }

  if (!res.ok) {
    if (opts.passthroughClientErrors && res.status >= 400 && res.status < 500) {
      // Caller-side error responses still need shape validation — they
      // are a documented success-path payload (OAuth device-flow).
      return validate(path, schema, parsed);
    }
    const msg = `${res.status} ${res.statusText} on POST ${path}`;
    throw new ApiError(msg, res.status, parsed);
  }
  return validate(path, schema, parsed);
}

export async function getJson<T>(
  path: string,
  schema: ResponseSchema<T>,
  opts: ApiOptions = {}
): Promise<T> {
  const url = new URL(path, apiHost()).toString();
  const headers: Record<string, string> = {
    Accept: "application/json",
    "User-Agent": userAgent()
  };
  if (opts.token) headers["Authorization"] = `Bearer ${opts.token}`;

  const res = await fetch(url, { headers });
  const text = await res.text();
  let parsed: unknown = null;
  if (text.length > 0) {
    try { parsed = JSON.parse(text); } catch { parsed = text; }
  }

  if (!res.ok) {
    throw new ApiError(`${res.status} ${res.statusText} on GET ${path}`, res.status, parsed);
  }
  return validate(path, schema, parsed);
}

function validate<T>(path: string, schema: ResponseSchema<T>, body: unknown): T {
  const result = v.safeParse(schema, body);
  if (result.success) return result.output;
  const summary = result.issues
    .map((issue) => {
      const dotted = (issue.path ?? [])
        .map((p) => (p as { key?: string | number }).key)
        .filter((k) => k !== undefined)
        .join(".");
      const where = dotted.length > 0 ? dotted : "(root)";
      return `    - ${where}: ${issue.message}`;
    })
    .join("\n");
  throw new SchemaValidationError(path, summary, body);
}

function userAgent(): string {
  // Identifies the CLI in server logs + lets us add platform-specific
  // throttles or feature-gates server-side later.
  const platform = process.platform; // darwin | linux | win32
  const arch = process.arch;         // arm64 | x64 | …
  return `drdeploy-cli/0.0.0 (${platform}; ${arch})`;
}

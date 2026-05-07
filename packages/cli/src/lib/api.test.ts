// Runtime schema validation for HTTP responses.
//
// These tests exercise the validate() boundary inside api.ts via the
// public getJson/postJson wrappers. Real fetch is replaced with a stub
// that returns a chosen status + body — no network calls escape the
// process.
//
// Goal of validation: server-side deploy skew (renamed key, missing
// required field, wrong type) should fail loud at the parse boundary
// with an "upgrade your CLI" hint, NOT silently render `undefined`
// later in a command-rendering function.

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import * as v from "valibot";
import { getJson, postJson, SchemaValidationError, ApiError } from "./api.ts";
import { ListResponseSchema } from "../commands/list.ts";
import { AddResponseSchema } from "../commands/add.ts";
import { ScanResponseSchema } from "../commands/scan.ts";
import {
  DeviceStartResponseSchema,
  DeviceTokenResponseSchema
} from "../commands/login.ts";

// ─── fetch stubbing ──────────────────────────────────────────────────

const realFetch = globalThis.fetch;

interface StubResponse {
  status?: number;
  body: unknown;
}

function stubFetch(stub: StubResponse): void {
  // Bun's `fetch` type has a `.preconnect` method beyond the standard
  // function signature. Cast through `unknown` so the stub satisfies the
  // structural type without us having to mock preconnect.
  const fn = async (): Promise<Response> => {
    const status = stub.status ?? 200;
    return new Response(JSON.stringify(stub.body), {
      status,
      headers: { "Content-Type": "application/json" }
    });
  };
  globalThis.fetch = fn as unknown as typeof fetch;
}

beforeEach(() => {
  // Default to a benign empty stub so a missing setup() never lets a
  // real network call slip out of a test.
  stubFetch({ body: {} });
});

afterEach(() => {
  globalThis.fetch = realFetch;
});

// ─── happy paths: known-good payloads parse cleanly ──────────────────

describe("schema validation — happy paths", () => {
  test("ListResponseSchema accepts a fully-populated response", async () => {
    stubFetch({
      body: {
        workspace: { id: 1, name: "acme", plan_key: "pro" },
        sites: [
          {
            id: 33,
            host: "example.com",
            environment: "production",
            host_provider: "vercel",
            framework: "nextjs",
            verified: true,
            share_enabled: false,
            last_scanned_at: "2026-05-06T12:00:00Z"
          }
        ]
      }
    });
    const data = await getJson("/api/v1/sites", ListResponseSchema);
    expect(data.workspace.name).toBe("acme");
    expect(data.sites[0]!.host).toBe("example.com");
  });

  test("ListResponseSchema accepts nullable fields as null", async () => {
    stubFetch({
      body: {
        workspace: { id: 1, name: "acme", plan_key: "pro" },
        sites: [
          {
            id: 33,
            host: "example.com",
            environment: "production",
            host_provider: null,
            framework: null,
            verified: false,
            share_enabled: false,
            last_scanned_at: null
          }
        ]
      }
    });
    const data = await getJson("/api/v1/sites", ListResponseSchema);
    expect(data.sites[0]!.last_scanned_at).toBeNull();
  });

  test("AddResponseSchema accepts a minimal site response", async () => {
    stubFetch({
      body: { id: 7, host: "x.test", environment: "production", verified: false }
    });
    const data = await postJson("/api/v1/sites", {}, AddResponseSchema);
    expect(data.id).toBe(7);
  });

  test("ScanResponseSchema accepts a successful 202 body", async () => {
    stubFetch({ body: { ok: true, scan_run_id: 42, message: "queued" } });
    const data = await postJson("/api/v1/sites/1/scan", {}, ScanResponseSchema);
    expect(data.scan_run_id).toBe(42);
  });

  test("ScanResponseSchema accepts null scan_run_id", async () => {
    stubFetch({ body: { ok: false, scan_run_id: null, message: "rate-limited" } });
    const data = await postJson("/api/v1/sites/1/scan", {}, ScanResponseSchema);
    expect(data.scan_run_id).toBeNull();
  });

  test("DeviceStartResponseSchema accepts a fresh device-flow start", async () => {
    stubFetch({
      body: {
        device_code: "abc",
        user_code: "WDJB",
        verification_uri: "https://drdeploy.dev/auth/device",
        verification_uri_complete: "https://drdeploy.dev/auth/device?code=WDJB",
        expires_in: 900,
        interval: 5
      }
    });
    const data = await postJson(
      "/api/v1/auth/device/start",
      {},
      DeviceStartResponseSchema
    );
    expect(data.user_code).toBe("WDJB");
  });

  test("DeviceTokenResponseSchema accepts the success branch", async () => {
    stubFetch({
      body: { access_token: "tok", token_type: "Bearer", scope: "account:full", expires_in: null }
    });
    const data = await postJson(
      "/api/v1/auth/device/token",
      {},
      DeviceTokenResponseSchema
    );
    expect("access_token" in data).toBe(true);
  });

  test("DeviceTokenResponseSchema accepts the error branch (passthrough 400)", async () => {
    stubFetch({ status: 400, body: { error: "authorization_pending" } });
    const data = await postJson(
      "/api/v1/auth/device/token",
      {},
      DeviceTokenResponseSchema,
      { passthroughClientErrors: true }
    );
    if ("error" in data) {
      expect(data.error).toBe("authorization_pending");
    } else {
      throw new Error("expected error branch");
    }
  });

  test("extra fields in the response are ignored (forward-compatible)", async () => {
    stubFetch({
      body: {
        id: 7,
        host: "x.test",
        environment: "production",
        verified: false,
        // Server adds a brand-new field — old CLIs must NOT explode.
        new_field_added_in_v2: "anything"
      }
    });
    const data = await postJson("/api/v1/sites", {}, AddResponseSchema);
    expect(data.host).toBe("x.test");
  });
});

// ─── sad paths: bad shapes throw the upgrade-suggestion error ────────

describe("schema validation — bad shapes throw upgrade-suggestion error", () => {
  test("missing required field throws SchemaValidationError", async () => {
    stubFetch({
      body: {
        // missing `workspace`
        sites: []
      }
    });
    let caught: unknown;
    try {
      await getJson("/api/v1/sites", ListResponseSchema);
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(SchemaValidationError);
    const msg = (caught as Error).message;
    expect(msg).toContain("your CLI may be out of date");
    expect(msg).toContain("drdeploy upgrade");
    expect(msg).toContain("install.sh");
    // The path of the failing field should be surfaced for dev mode.
    expect(msg).toContain("workspace");
  });

  test("wrong type on a required field throws SchemaValidationError", async () => {
    stubFetch({
      body: { id: "not-a-number", host: "x.test", environment: "production", verified: false }
    });
    let caught: unknown;
    try {
      await postJson("/api/v1/sites", {}, AddResponseSchema);
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(SchemaValidationError);
    expect((caught as SchemaValidationError).path).toBe("/api/v1/sites");
  });

  test("nested type drift (sites[0].verified flipped to string) throws", async () => {
    stubFetch({
      body: {
        workspace: { id: 1, name: "acme", plan_key: "pro" },
        sites: [
          {
            id: 1,
            host: "x.test",
            environment: "production",
            host_provider: null,
            framework: null,
            verified: "yes", // server contract regression — should be boolean
            share_enabled: false,
            last_scanned_at: null
          }
        ]
      }
    });
    let caught: unknown;
    try {
      await getJson("/api/v1/sites", ListResponseSchema);
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(SchemaValidationError);
    expect((caught as Error).message).toContain("verified");
  });

  test("device-flow error endpoint with unknown error code throws", async () => {
    // Server adds a new OAuth error code the CLI doesn't know about.
    // Without schema validation this would silently fall into the
    // exhaustive `default:` branch only at runtime — schema makes it
    // fail at the parse boundary with an upgrade hint.
    stubFetch({ status: 400, body: { error: "rate_limit_exceeded" } });
    let caught: unknown;
    try {
      await postJson(
        "/api/v1/auth/device/token",
        {},
        DeviceTokenResponseSchema,
        { passthroughClientErrors: true }
      );
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(SchemaValidationError);
  });
});

// ─── ApiError still wins for unrelated non-2xx responses ─────────────

describe("validation does not interfere with non-2xx error path", () => {
  test("non-passthrough 500 still throws ApiError, not SchemaValidationError", async () => {
    stubFetch({ status: 500, body: { error: { message: "boom" } } });
    let caught: unknown;
    try {
      // Schema arg is irrelevant on the 500 path — never reached.
      await postJson("/api/v1/sites", {}, AddResponseSchema);
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(ApiError);
    expect((caught as ApiError).status).toBe(500);
  });
});

// ─── sanity: exercising the schema directly ──────────────────────────

describe("schemas in isolation", () => {
  test("ScanResponseSchema rejects null `ok`", () => {
    const result = v.safeParse(ScanResponseSchema, {
      ok: null,
      scan_run_id: 1,
      message: "x"
    });
    expect(result.success).toBe(false);
  });
});

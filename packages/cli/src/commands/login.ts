// `drdeploy login` — RFC 8628 OAuth Device Authorization Grant.
//
// 1. POST /api/v1/auth/device/start  → device_code + user_code + URLs
// 2. Show user the user_code, print + open the verification URL
// 3. POST /api/v1/auth/device/token at `interval` seconds until:
//      200 + access_token         → save and bail
//      error: authorization_pending → keep polling
//      error: slow_down             → bump interval, keep polling
//      error: expired_token         → tell user to re-run
//      error: access_denied         → tell user the prompt was rejected
//
// The user can Ctrl+C at any time; outstanding device codes expire
// server-side after 15 min so leaking one isn't dangerous.

import * as v from "valibot";
import { postJson } from "../lib/api.ts";
import { writeToken, tokenExists } from "../lib/config.ts";
import { openInBrowser } from "../lib/browser.ts";
import { bold, cyan, dim, green } from "../lib/fmt.ts";

const DeviceStartResponseSchema = v.object({
  device_code: v.string(),
  user_code: v.string(),
  verification_uri: v.string(),
  verification_uri_complete: v.string(),
  expires_in: v.number(),
  interval: v.number()
});
export type DeviceStartResponse = v.InferOutput<typeof DeviceStartResponseSchema>;
export { DeviceStartResponseSchema };

const DeviceTokenSuccessSchema = v.object({
  access_token: v.string(),
  token_type: v.literal("Bearer"),
  scope: v.string(),
  expires_in: v.nullable(v.number())
});
export type DeviceTokenSuccess = v.InferOutput<typeof DeviceTokenSuccessSchema>;

const DeviceTokenErrorSchema = v.object({
  error: v.picklist(["authorization_pending", "slow_down", "expired_token", "access_denied"])
});
export type DeviceTokenError = v.InferOutput<typeof DeviceTokenErrorSchema>;

// The token endpoint returns either shape with an HTTP 200 on success
// OR an HTTP 400 carrying the OAuth error code (passed through by
// postJson when passthroughClientErrors is set). A union schema lets
// either pass — and rejects anything else as out-of-contract drift.
const DeviceTokenResponseSchema = v.union([
  DeviceTokenSuccessSchema,
  DeviceTokenErrorSchema
]);
export type DeviceTokenResponse = v.InferOutput<typeof DeviceTokenResponseSchema>;
export { DeviceTokenSuccessSchema, DeviceTokenErrorSchema, DeviceTokenResponseSchema };

export default async function login(): Promise<void> {
  if (await tokenExists()) {
    console.log("You're already signed in. Run `drdeploy logout` first to start over.");
    return;
  }

  // Step 1 — mint a device code
  const start = await postJson(
    "/api/v1/auth/device/start",
    { scope: "account:full" },
    DeviceStartResponseSchema
  );

  // Step 2 — show the code and open the browser
  printPrompt(start);
  openInBrowser(start.verification_uri_complete);

  // Step 3 — poll until done
  const token = await pollForToken(start);
  if (token == null) return; // pollForToken printed its own diagnostic

  await writeToken(token);
  console.log("");
  console.log(`${green("✓")} Signed in. Token saved.`);
  console.log("");
  console.log(`Try:  ${cyan("drdeploy list")}`);
}

function printPrompt(start: DeviceStartResponse): void {
  // Server already returns absolute URLs in verification_uri /
  // verification_uri_complete (built from APP_HOST in Rails). Print
  // verbatim — prepending apiHost() gave us double-host strings like
  // "http://localhostHTTP://localhost/auth/device" in the wild.
  //
  // Lead with the prefilled URL (one click from approve) and surface
  // the bare URL + code only as the manual fallback. The earlier layout
  // printed the bare URL first and the prefilled link last, which
  // pushed the user toward the slower path.
  console.log("");
  console.log(`Open this URL in your browser to approve:`);
  console.log(`  ${cyan(start.verification_uri_complete)}`);
  console.log("");
  console.log(dim(`Browser didn't open? Visit ${start.verification_uri} and enter ${bold(start.user_code)}`));
  console.log("");
  console.log(dim("Waiting for approval…"));
}

async function pollForToken(start: DeviceStartResponse): Promise<string | null> {
  const deadlineMs = Date.now() + start.expires_in * 1000;
  let intervalSec = Math.max(1, start.interval);

  while (Date.now() < deadlineMs) {
    await sleep(intervalSec * 1000);

    const res = await postJson(
      "/api/v1/auth/device/token",
      { device_code: start.device_code },
      DeviceTokenResponseSchema,
      { passthroughClientErrors: true }
    );

    if ("access_token" in res) {
      return res.access_token;
    }

    switch (res.error) {
      case "authorization_pending":
        continue;
      case "slow_down":
        intervalSec += 5;
        continue;
      case "expired_token":
        console.error("");
        console.error("Code expired before approval. Run `drdeploy login` again.");
        return null;
      case "access_denied":
        console.error("");
        console.error("Access was denied in the browser. No token saved.");
        return null;
      default: {
        // Unknown error — bail loudly. Caller has the request log.
        const _exhaustive: never = res.error;
        console.error(`Unexpected response from token endpoint: ${JSON.stringify(_exhaustive)}`);
        return null;
      }
    }
  }

  console.error("");
  console.error("Timed out waiting for approval. Run `drdeploy login` again.");
  return null;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

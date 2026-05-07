// `drdeploy scan <host-or-id>` — trigger a scan now.
//
// Argument can be a numeric site id ("33") or a host ("glink.so",
// "https://glink.so"). When a host is provided, we GET /api/v1/sites,
// match by host, and use the resolved id. Then POST /api/v1/sites/:id/scan.
//
// Server returns 202 with scan_run_id on success or 403 with
// {error: {code: "site_unverified"}} when the site hasn't been verified
// yet (we surface a friendly hint to /sites/:id/verify in that case).

import * as v from "valibot";
import { getJson, postJson, ApiError } from "../lib/api.ts";
import { requireToken } from "../lib/auth.ts";
import { cyan, green, yellow, dim } from "../lib/fmt.ts";
import { parseHost, InvalidUrlError } from "../lib/url.ts";

// Narrower variant of the full /api/v1/sites response — scan only needs
// the (id, host) pairs to resolve a host argument to an id. We accept
// extra fields silently (valibot strips by default), so renames of
// share_enabled/etc. won't break this lookup path.
const SiteRefListSchema = v.object({
  workspace: v.object({
    id: v.number(),
    name: v.string(),
    plan_key: v.string()
  }),
  sites: v.array(v.looseObject({ id: v.number(), host: v.string() }))
});
export type SiteRefList = v.InferOutput<typeof SiteRefListSchema>;
export { SiteRefListSchema };

const ScanResponseSchema = v.object({
  ok: v.boolean(),
  scan_run_id: v.nullable(v.number()),
  message: v.string()
});
export type ScanResponse = v.InferOutput<typeof ScanResponseSchema>;
export { ScanResponseSchema };

export default async function scan(args: readonly string[]): Promise<void> {
  const raw = args[0];
  if (!raw) {
    console.error("Usage: drdeploy scan <host-or-id>");
    console.error("       drdeploy scan glink.so");
    console.error("       drdeploy scan 33");
    process.exit(1);
  }

  const token = await requireToken();
  const id = await resolveSiteId(raw, token);

  try {
    const res = await postJson(`/api/v1/sites/${id}/scan`, {}, ScanResponseSchema, { token });
    console.log("");
    console.log(`${green("✓")} ${res.message}${res.scan_run_id ? dim(` (run #${res.scan_run_id})`) : ""}`);
    console.log("");
    console.log(`  Watch progress on the dashboard or rerun ${cyan(`drdeploy scan ${raw}`)}.`);
    console.log("");
  } catch (err) {
    if (err instanceof ApiError && err.status === 403) {
      const code = (err.body as { error?: { code?: string; message?: string } })?.error;
      if (code?.code === "site_unverified") {
        console.error("");
        console.error(yellow("✗ Site is not verified yet."));
        console.error(`  ${code.message ?? "Visit /sites/<id>/verify to set up verification."}`);
        console.error("");
        process.exit(1);
      }
    }
    throw err;
  }
}

// Resolve a host or numeric id to a numeric id. Numeric input is
// trusted; host input requires a list lookup (one extra request, fine
// for an interactive CLI).
async function resolveSiteId(raw: string, token: string): Promise<number> {
  if (/^\d+$/.test(raw.trim())) return Number(raw.trim());

  let wantedHost: string;
  try {
    wantedHost = parseHost(raw).host;
  } catch (err) {
    if (err instanceof InvalidUrlError) {
      console.error("");
      console.error(`✗ ${err.message}`);
      console.error("");
      process.exit(1);
    }
    throw err;
  }

  const data = await getJson("/api/v1/sites", SiteRefListSchema, { token });
  const match = data.sites.find((s) => s.host.toLowerCase() === wantedHost);
  if (!match) {
    console.error("");
    console.error(`✗ No site matching '${wantedHost}' in this workspace.`);
    console.error(`  Run ${cyan("drdeploy list")} to see what's there, or ${cyan(`drdeploy add ${wantedHost}`)} to add it.`);
    console.error("");
    process.exit(1);
  }
  return match.id;
}

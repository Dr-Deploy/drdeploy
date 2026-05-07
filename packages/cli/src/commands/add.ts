// `drdeploy add <url>` — register a new site for monitoring.
//
// Wraps POST /api/v1/sites. We accept "example.com", "https://example.com",
// or "https://example.com/path?foo=bar" — the host-extracting URL parse
// keeps the CLI forgiving while the server still gets a clean host
// string. Environment defaults to "production"; user can override
// later from /sites/<id>.

import * as v from "valibot";
import { postJson, ApiError } from "../lib/api.ts";
import { requireToken } from "../lib/auth.ts";
import { dim, green, yellow, cyan } from "../lib/fmt.ts";
import { parseHost, InvalidUrlError } from "../lib/url.ts";

const AddResponseSchema = v.object({
  id: v.number(),
  host: v.string(),
  environment: v.string(),
  verified: v.boolean()
});
export type AddResponse = v.InferOutput<typeof AddResponseSchema>;
export { AddResponseSchema };

export default async function add(args: readonly string[]): Promise<void> {
  const raw = args[0];
  if (!raw) {
    console.error("Usage: drdeploy add <url>");
    console.error("       drdeploy add example.com");
    console.error("       drdeploy add https://app.example.com");
    process.exit(1);
  }

  let host: string;
  try {
    host = parseHost(raw).host;
  } catch (err) {
    if (err instanceof InvalidUrlError) {
      console.error("");
      console.error(`✗ ${err.message}`);
      console.error("");
      process.exit(1);
    }
    throw err;
  }
  const token = await requireToken();

  try {
    const site = await postJson(
      "/api/v1/sites",
      { site: { host, environment: "production" } },
      AddResponseSchema,
      { token }
    );

    console.log("");
    console.log(`${green("✓")} Added ${cyan(site.host)} ${dim(`(id ${site.id}, ${site.environment})`)}`);
    console.log("");

    if (site.verified) {
      console.log(`  Site is auto-verified. Trigger a scan with:`);
      console.log(`      drdeploy scan ${site.host}`);
    } else {
      console.log(yellow(`  Next: verify ownership before the first scan.`));
      console.log(`      Open ${cyan(`/sites/${site.id}/verify`)} on drdeploy.dev to set up the DNS TXT or .well-known check.`);
    }
    console.log("");
  } catch (err) {
    if (err instanceof ApiError && err.status === 422) {
      const details = (err.body as { error?: { details?: Record<string, string[]> } })?.error?.details;
      console.error("");
      console.error("✗ Couldn't add site:");
      if (details) {
        for (const [field, msgs] of Object.entries(details)) {
          for (const msg of msgs) console.error(`  • ${field} ${msg}`);
        }
      } else {
        console.error("  Validation failed.");
      }
      process.exit(1);
    }
    throw err;
  }
}

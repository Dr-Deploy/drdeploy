// `drdeploy list` — show all sites under the current workspace.
//
// Wraps GET /api/v1/sites. Renders a small text table; pipes-friendly
// (auto-disables color when stdout isn't a TTY).

import * as v from "valibot";
import { getJson } from "../lib/api.ts";
import { requireToken } from "../lib/auth.ts";
import { table, dim, green, yellow, cyan, relativeTime } from "../lib/fmt.ts";

const ListResponseSchema = v.object({
  workspace: v.object({
    id: v.number(),
    name: v.string(),
    plan_key: v.string()
  }),
  sites: v.array(v.object({
    id: v.number(),
    host: v.string(),
    environment: v.string(),
    host_provider: v.nullable(v.string()),
    framework: v.nullable(v.string()),
    verified: v.boolean(),
    share_enabled: v.boolean(),
    last_scanned_at: v.nullable(v.string())
  }))
});
export type ListResponse = v.InferOutput<typeof ListResponseSchema>;
export { ListResponseSchema };

export default async function list(): Promise<void> {
  const token = await requireToken();
  const data = await getJson("/api/v1/sites", ListResponseSchema, { token });

  console.log("");
  console.log(`${cyan(data.workspace.name)} ${dim(`(${data.workspace.plan_key})`)}`);
  console.log("");

  if (data.sites.length === 0) {
    console.log(dim("  No sites yet. Add one with: drdeploy add <url>"));
    console.log("");
    return;
  }

  console.log(
    table(data.sites, [
      { header: "ID",        get: (s) => String(s.id) },
      { header: "HOST",      get: (s) => s.host },
      { header: "ENV",       get: (s) => s.environment },
      { header: "VERIFIED",  get: (s) => s.verified ? green("yes") : yellow("pending") },
      { header: "LAST SCAN", get: (s) => s.last_scanned_at ? relativeTime(s.last_scanned_at) : dim("never") }
    ])
  );
  console.log("");
}

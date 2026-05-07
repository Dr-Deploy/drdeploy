// `npx @drdeploy/skills setup` flow.
//
// Three pieces:
//   1. Choose install scope (project / global / both) and write SKILL.md there
//   2. If `drdeploy` is not on PATH, run the install.sh script via curl|sh
//   3. Append a drdeploy routing block to CLAUDE.md (asks first)
//
// All three are independently skippable via flags. Re-runs are idempotent
// (overwrite SKILL.md, no-op CLAUDE.md if marker already present).

import { existsSync, readFileSync, writeFileSync, mkdirSync, copyFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execSync, spawnSync } from "node:child_process";
import { ask, askChoice, hasFlag, flagValue } from "./prompt.ts";

interface SetupOptions {
  args: readonly string[];
}

const ROUTING_MARKER = "<!-- @drdeploy/skills routing — managed block, edit freely or delete -->";
const ROUTING_BLOCK = `${ROUTING_MARKER}

## drdeploy

Invoke the drdeploy skill (or call \`drdeploy\` CLI directly) when:
- User wants to scan a deployed website for issues
- User mentions leaked API keys, broken og:image, missing favicons, exposed .env
- After a deploy, to verify the live site is healthy

The skill source is at \`~/.claude/skills/drdeploy/SKILL.md\` (or \`.claude/skills/drdeploy/SKILL.md\` in this project).
Service: https://drdeploy.dev — issues: https://github.com/Dr-Deploy/drdeploy/issues
<!-- /@drdeploy/skills -->`;

export async function setup(opts: SetupOptions): Promise<void> {
  const args = opts.args;
  const yesAll = hasFlag(args, "--yes", "-y");

  console.log("");
  console.log("drdeploy skills v0.1.0");
  console.log("");

  // ── 1. Install scope ──────────────────────────────────────────────────
  const scope = await resolveScope(args, yesAll);
  await writeSkillFiles(scope);

  // ── 2. CLI binary ─────────────────────────────────────────────────────
  if (hasFlag(args, "--skip-cli")) {
    console.log("→ Skipping CLI install (--skip-cli)");
  } else if (cliOnPath()) {
    const v = cliVersion();
    console.log(`✓ drdeploy ${v ?? "(version unknown)"} already on PATH`);
  } else {
    const want = yesAll || await ask("drdeploy CLI not found on PATH. Install it now via the official installer?", true);
    if (want) {
      installCli();
    } else {
      console.log("→ Skipped CLI install. Run later: curl -fsSL https://drdeploy.dev/install | sh");
    }
  }

  // ── 3. CLAUDE.md routing ──────────────────────────────────────────────
  if (hasFlag(args, "--skip-claude-md")) {
    console.log("→ Skipping CLAUDE.md routing (--skip-claude-md)");
  } else {
    const targets = ["./CLAUDE.md", join(homedir(), ".claude", "CLAUDE.md")];
    for (const target of targets) {
      if (!existsSync(target)) continue;
      const want = yesAll || await ask(`Append drdeploy routing rules to ${target}?`, true);
      if (want) appendRouting(target);
    }
  }

  console.log("");
  console.log("✓ Done.");
  console.log("");
  console.log("Try in your AI editor:");
  console.log("  > scan myapp.com with drdeploy");
  console.log("  > what did drdeploy find on my last deploy");
  console.log("");
}

// ─── Scope ───────────────────────────────────────────────────────────────

type Scope = "local" | "global" | "both";

async function resolveScope(args: readonly string[], yesAll: boolean): Promise<Scope> {
  if (hasFlag(args, "--both")) return "both";
  if (hasFlag(args, "--global")) return "global";
  if (hasFlag(args, "--local")) return "local";
  if (yesAll) return "local"; // default for non-interactive runs

  const choice = await askChoice(
    "Where do you want to install the skill?",
    [
      { key: "local",  label: "Project local — ./.claude/skills/drdeploy/" },
      { key: "global", label: "Global       — ~/.claude/skills/drdeploy/" },
      { key: "both",   label: "Both" }
    ],
    "local"
  );
  return choice as Scope;
}

async function writeSkillFiles(scope: Scope): Promise<void> {
  const skillSrc = resolvePackagedSkill();
  const targets: string[] = [];
  if (scope === "local"  || scope === "both") targets.push(join(process.cwd(), ".claude", "skills", "drdeploy"));
  if (scope === "global" || scope === "both") targets.push(join(homedir(), ".claude", "skills", "drdeploy"));

  for (const dir of targets) {
    mkdirSync(dir, { recursive: true });
    copyFileSync(skillSrc, join(dir, "SKILL.md"));
    console.log(`✓ Wrote SKILL.md to ${dir}/`);
  }
}

function resolvePackagedSkill(): string {
  // The SKILL.md ships next to the compiled cli.js inside the npm package
  // (../skill/SKILL.md relative to dist/cli.js).
  const here = dirname(fileURLToPath(import.meta.url));
  const candidates = [
    join(here, "..", "skill", "SKILL.md"),  // built layout: dist/cli.js → ../skill/
    join(here, "skill", "SKILL.md")          // dev layout: src/setup.ts → ./skill/ (won't hit, here for safety)
  ];
  for (const c of candidates) {
    if (existsSync(c)) return c;
  }
  throw new Error("Could not locate packaged SKILL.md — did the npm publish miss the skill/ directory?");
}

// ─── CLI binary ──────────────────────────────────────────────────────────

function cliOnPath(): boolean {
  const cmd = process.platform === "win32" ? "where" : "command";
  const args = process.platform === "win32" ? ["drdeploy"] : ["-v", "drdeploy"];
  const r = spawnSync(cmd, args, { stdio: "ignore" });
  return r.status === 0;
}

function cliVersion(): string | null {
  try {
    const out = execSync("drdeploy --version", { encoding: "utf8" }).trim();
    return out;
  } catch { return null; }
}

function installCli(): void {
  console.log("→ Running: curl -fsSL https://drdeploy.dev/install | sh");
  try {
    execSync("curl -fsSL https://drdeploy.dev/install | sh", { stdio: "inherit" });
    const v = cliVersion();
    console.log(`✓ drdeploy ${v ?? ""} installed`);
  } catch {
    console.error("✗ Install failed. Try manually: curl -fsSL https://drdeploy.dev/install | sh");
  }
}

// ─── CLAUDE.md ───────────────────────────────────────────────────────────

function appendRouting(target: string): void {
  const current = readFileSync(target, "utf8");
  if (current.includes(ROUTING_MARKER)) {
    console.log(`✓ ${target} already has the routing block, no-op`);
    return;
  }
  const sep = current.endsWith("\n") ? "\n" : "\n\n";
  writeFileSync(target, current + sep + ROUTING_BLOCK + "\n");
  console.log(`✓ Appended routing block to ${target}`);
}

// `npx @drdeploy/skills uninstall` — reverses what `setup` wrote.
//
// Removes:
//   - ./.claude/skills/drdeploy/   (project)
//   - ~/.claude/skills/drdeploy/   (global)
//   - The drdeploy block in ./CLAUDE.md and ~/.claude/CLAUDE.md
//
// Does NOT touch the drdeploy CLI binary itself — the user installed that
// via their own package manager / install.sh, and might still want it.

import { existsSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { ask, hasFlag } from "./prompt.ts";

interface UninstallOptions {
  args: readonly string[];
}

const ROUTING_MARKER_OPEN  = "<!-- @drdeploy/skills routing — managed block, edit freely or delete -->";
const ROUTING_MARKER_CLOSE = "<!-- /@drdeploy/skills -->";

export async function uninstall(opts: UninstallOptions): Promise<void> {
  const yesAll = hasFlag(opts.args, "--yes", "-y");

  const skillDirs = [
    join(process.cwd(), ".claude", "skills", "drdeploy"),
    join(homedir(),    ".claude", "skills", "drdeploy")
  ];
  const claudeMds = [
    join(process.cwd(), "CLAUDE.md"),
    join(homedir(), ".claude", "CLAUDE.md")
  ];

  console.log("");
  console.log("drdeploy skills uninstall");
  console.log("");

  for (const dir of skillDirs) {
    if (!existsSync(dir)) continue;
    const want = yesAll || await ask(`Remove ${dir}?`, true);
    if (want) {
      rmSync(dir, { recursive: true, force: true });
      console.log(`✓ Removed ${dir}`);
    }
  }

  for (const md of claudeMds) {
    if (!existsSync(md)) continue;
    const current = readFileSync(md, "utf8");
    if (!current.includes(ROUTING_MARKER_OPEN)) continue;
    const want = yesAll || await ask(`Remove drdeploy routing block from ${md}?`, true);
    if (want) {
      const stripped = stripBlock(current);
      writeFileSync(md, stripped);
      console.log(`✓ Stripped routing block from ${md}`);
    }
  }

  console.log("");
  console.log("Done. The drdeploy CLI binary is untouched — uninstall it via your");
  console.log("package manager (or rm $(which drdeploy)) if you also want it gone.");
  console.log("");
}

function stripBlock(content: string): string {
  const startIdx = content.indexOf(ROUTING_MARKER_OPEN);
  if (startIdx === -1) return content;
  const closeIdx = content.indexOf(ROUTING_MARKER_CLOSE, startIdx);
  if (closeIdx === -1) {
    // Marker open without close — strip from open to end of file. Leaves
    // a blank trailing line which is fine.
    return content.slice(0, startIdx).trimEnd() + "\n";
  }
  const endIdx = closeIdx + ROUTING_MARKER_CLOSE.length;
  // Also drop the leading separator (\n or \n\n) so we don't leave a hole.
  let cutStart = startIdx;
  while (cutStart > 0 && (content[cutStart - 1] === "\n" || content[cutStart - 1] === " ")) cutStart--;
  return (content.slice(0, cutStart) + content.slice(endIdx)).trimEnd() + "\n";
}

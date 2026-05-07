// `drdeploy-skills` — entrypoint for `npx @drdeploy/skills <command>`.
//
// Commands:
//   setup        — install SKILL.md, install CLI binary, append CLAUDE.md routing
//   uninstall    — remove SKILL.md + CLAUDE.md routing block (CLI binary stays)
//   --version    — print version
//   --help       — usage

import { setup } from "./setup.ts";
import { uninstall } from "./uninstall.ts";
import pkg from "../package.json" with { type: "json" };
const VERSION = pkg.version;

const cmd = process.argv[2];

main(cmd).catch((err: unknown) => {
  console.error("");
  console.error("✗ " + (err instanceof Error ? err.message : String(err)));
  process.exit(1);
});

async function main(cmd: string | undefined): Promise<void> {
  switch (cmd) {
    case "setup":
      await setup({ args: process.argv.slice(3) });
      return;

    case "uninstall":
    case "remove":
      await uninstall({ args: process.argv.slice(3) });
      return;

    case "--version":
    case "-v":
    case "version":
      console.log(`@drdeploy/skills ${VERSION}`);
      return;

    case undefined:
    case "--help":
    case "-h":
    case "help":
      printHelp();
      return;

    default:
      console.error(`unknown command: ${cmd}`);
      console.error(`run 'drdeploy-skills --help' to see options`);
      process.exit(1);
  }
}

function printHelp(): void {
  console.log(`@drdeploy/skills — Claude Code / Cursor / Cline skills for drdeploy

USAGE
  npx @drdeploy/skills <command>

COMMANDS
  setup           install SKILL.md + CLI binary + CLAUDE.md routing (interactive)
  uninstall       remove SKILL.md + CLAUDE.md routing block
  --version       print version
  --help          this message

FLAGS (setup)
  --global        install to ~/.claude/skills/ only (skip prompt)
  --local         install to ./.claude/skills/ only (skip prompt)
  --both          install to both (skip prompt)
  --skip-cli      do not download the drdeploy binary
  --skip-claude-md do not append routing to CLAUDE.md
  --yes / -y      answer yes to every prompt

DOCS  https://drdeploy.dev/docs/skills
`);
}

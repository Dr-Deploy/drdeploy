# `@drdeploy/skills`

Skills for Claude Code, Cursor, Cline, Continue, and other AI editors that speak the [agentskills.io](https://agentskills.io) format. One command:

1. Drops `SKILL.md` files into your skill directory (global or project-local)
2. Downloads the `drdeploy` CLI binary if you don't have it yet
3. Adds drdeploy routing rules to your `CLAUDE.md`

After setup, your AI editor knows when to invoke drdeploy and how to read the results.

## Install

```bash
npx @drdeploy/skills setup
```

That's it. The setup is interactive; it asks before writing anywhere.

```
$ npx @drdeploy/skills setup

drdeploy skills v0.1.0

? Where do you want to install the skill?
  ❯ Project local — ./.claude/skills/drdeploy/
    Global       — ~/.claude/skills/drdeploy/
    Both
✓ Wrote SKILL.md to ./.claude/skills/drdeploy/

? drdeploy CLI not found on PATH. Install it now?
  ❯ Yes — runs https://drdeploy.dev/install
    No — I'll install manually later
✓ drdeploy 0.1.0 installed at /usr/local/bin/drdeploy

? Append drdeploy routing rules to ./CLAUDE.md? (Y/n)
✓ Done.

Try in your AI editor:
  > scan myapp.com with drdeploy
  > what did drdeploy find on my last deploy
```

## Uninstall

```bash
npx @drdeploy/skills uninstall
```

Removes the SKILL.md files and the routing block in CLAUDE.md. Does NOT uninstall the CLI binary itself (use your package manager / `rm /usr/local/bin/drdeploy`).

## What gets written

### Skill file (SKILL.md)

A markdown file with frontmatter that AI editors read as a "this is a tool I have" prompt. Tells the agent: "if the user wants to check a website, run `drdeploy scan <host>`, parse the output like this, surface findings like that."

See [the source](./skill/SKILL.md) for the full content.

### CLAUDE.md routing

A short, dismissible block:

```markdown
## drdeploy

Use `/drdeploy` skill (or invoke `drdeploy` CLI directly) when:
- User wants to scan a deployed site for issues
- User mentions broken og:image, leaked API keys, missing favicons, exposed .env
- After a deploy, to verify the live site is healthy

See ~/.claude/skills/drdeploy/ for the full skill.
```

Self-contained. You can edit or delete it any time.

## Why this exists

The `drdeploy` CLI is a static binary — fast, no runtime deps. But getting it on PATH AND telling your AI editor when to use it AND configuring CLAUDE.md is three steps. This package collapses them to one command, the same way [`gstack`](https://github.com/garrytan/gstack) does for its skills.

## Other ways to install

### As a Claude Code plugin (zero-npm path)

```
> /plugin marketplace add Dr-Deploy/drdeploy
> /plugin install drdeploy
```

This reads [`.claude-plugin/marketplace.json`](https://github.com/Dr-Deploy/drdeploy/blob/main/.claude-plugin/marketplace.json) at the repo root and installs the skill via Claude Code's native plugin system. No `npx` needed.

### Manual SKILL.md drop

If your AI editor speaks the [agentskills.io](https://agentskills.io) format, you can copy [`skill/SKILL.md`](./skill/SKILL.md) into your editor's skills directory by hand. That's the entire contract.

## Spec compliance

The `SKILL.md` follows the [agentskills.io specification](https://agentskills.io/specification) (open standard, used by Claude Code, OpenAI Codex CLI, Cursor, Cline, Gemini CLI, GitHub Copilot, and ~30 others).

## Where to find this skill

| Channel | Status | URL |
|---|---|---|
| npm | yes | https://www.npmjs.com/package/@drdeploy/skills |
| GitHub | yes | https://github.com/Dr-Deploy/drdeploy/tree/main/packages/skills |
| Claude plugin marketplace | yes | `/plugin marketplace add Dr-Deploy/drdeploy` |
| skills.sh | submitted | https://skills.sh — auto-indexes public repos with SKILL.md |
| anthropics/skills | requested | https://github.com/anthropics/skills — partner inclusion |
| claudeskills.info | submitted | https://claudeskills.info |
| skillsmp.com | submitted | https://skillsmp.com |
| lobehub.com/skills | submitted | https://lobehub.com/skills |

## License

MIT.

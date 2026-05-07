#!/usr/bin/env bun
// drdeploy CLI — entrypoint.
//
// Thin dispatcher. Each subcommand lives in its own module under
// commands/* and exports a default async fn. Bun lazy-loads imports
// it doesn't reach, so the help-only path stays fast.

const VERSION = "0.0.0";

const subcommand = process.argv[2];

main(subcommand).catch((err: unknown) => {
  console.error("");
  console.error("✗ " + describeError(err));
  process.exit(1);
});

async function main(cmd: string | undefined): Promise<void> {
  switch (cmd) {
    case "--version":
    case "-v":
    case "version":
      console.log(`drdeploy ${VERSION}`);
      return;

    case undefined:
    case "--help":
    case "-h":
    case "help":
      printHelp();
      return;

    case "login": {
      const { default: login } = await import("./commands/login.ts");
      await login();
      return;
    }

    case "logout": {
      const { default: logout } = await import("./commands/logout.ts");
      await logout();
      return;
    }

    case "list":
    case "ls": {
      const { default: list } = await import("./commands/list.ts");
      await list();
      return;
    }

    case "add": {
      const { default: add } = await import("./commands/add.ts");
      await add(process.argv.slice(3));
      return;
    }

    case "scan": {
      const { default: scan } = await import("./commands/scan.ts");
      await scan(process.argv.slice(3));
      return;
    }

    case "mcp": {
      const { default: mcp } = await import("./commands/mcp.ts");
      await mcp(process.argv.slice(3));
      return;
    }

    default:
      console.error(`unknown command: ${cmd}`);
      console.error(`run 'drdeploy --help' to see what's available`);
      process.exit(1);
  }
}

function printHelp(): void {
  console.log(`drdeploy — post-deploy scanner for shipped sites

USAGE
  drdeploy <command> [args]

COMMANDS
  login                authenticate via OAuth 2.0 device flow
  logout               revoke local token
  add <url>            register a new site for monitoring
  list / ls            list sites under the current workspace
  scan <host|id>       trigger a scan now
  status               show service health + last-check times (planned)
  watch [url]          daemon — re-scan on every git push     (planned)
  mcp serve            run the embedded MCP server (called by AI editors)
  mcp install          configure your local AI agent (Claude/Cursor/Cline)
  --version            print version
  --help               this message

ENV
  DRDEPLOY_API_HOST    override the API host (default: https://drdeploy.dev)
  DRDEPLOY_CONFIG_DIR  override the config dir (default: ~/.config/drdeploy)

DOCS  https://drdeploy.dev/install
`);
}

function describeError(err: unknown): string {
  // Server returns errors as { error: { code, message } }. Extract the
  // human-readable message instead of the raw HTTP status line.
  if (typeof err === "object" && err !== null && "name" in err && err.name === "ApiError") {
    const e = err as unknown as { status: number; body: unknown; message: string };
    const body = e.body as { error?: { message?: string; code?: string } } | null;
    const friendly = body?.error?.message;
    if (friendly && typeof friendly === "string") {
      return mapByStatus(e.status, friendly);
    }
    return mapByStatus(e.status, e.message);
  }
  if (err instanceof Error) return err.message;
  return String(err);
}

function mapByStatus(status: number, fallback: string): string {
  switch (status) {
    case 401: return "Token rejected by the server. Run `drdeploy logout` then `drdeploy login` to refresh.";
    case 403: return fallback;
    case 404: return fallback;
    case 422: return fallback;
    case 429: return "Rate-limited by the server. Wait a minute and try again.";
    default:
      return status >= 500
        ? `Server error (${status}). Try again in a moment — if it persists, file an issue.`
        : fallback;
  }
}

// Cross-platform "open this URL in the user's default browser."
// macOS uses `open`, Linux uses `xdg-open`, Windows uses `start`.
// Failure is silent — the calling command also prints the URL so the
// user can copy-paste it manually if the spawn fails (SSH session,
// headless server, missing xdg-utils, etc.).

import { spawn } from "node:child_process";

export function openInBrowser(url: string): void {
  const cmd =
    process.platform === "darwin" ? "open"
    : process.platform === "win32" ? "cmd"
    : "xdg-open";

  const args = process.platform === "win32" ? ["/c", "start", "", url] : [url];

  try {
    const child = spawn(cmd, args, { stdio: "ignore", detached: true });
    child.on("error", () => { /* swallow — manual fallback printed by caller */ });
    child.unref();
  } catch {
    // ignore — caller has printed the URL already
  }
}

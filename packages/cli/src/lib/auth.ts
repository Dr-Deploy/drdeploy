// Common gate for any subcommand that needs a token. Loads it from
// disk (~/.config/drdeploy/token) and throws a friendly Error pointing
// at `drdeploy login` if missing. Throwing instead of process.exit-ing
// keeps the entrypoint's catch block as the single exit boundary, so
// tests and future programmatic use don't get torn down by a sub-call.

import { lstat } from "node:fs/promises";
import { readToken, tokenPath } from "./config.ts";

export class NotSignedInError extends Error {
  constructor() {
    super("Not signed in. Run `drdeploy login` first.");
    this.name = "NotSignedInError";
  }
}

export class InsecureTokenError extends Error {
  constructor(detail: string) {
    super(`Refusing to use the saved token: ${detail}\n  Run \`chmod 600 ${tokenPath()}\` (or re-run \`drdeploy login\`).`);
    this.name = "InsecureTokenError";
  }
}

export async function requireToken(): Promise<string> {
  await assertSecureTokenFile();
  const token = await readToken();
  if (!token) throw new NotSignedInError();
  return token;
}

// Refuse to use a token file that's group/world-readable, or that's
// reached via a symlink we don't control. lstat (NOT stat) so a symlink
// pointing at /etc/passwd doesn't stealth-pass the mode check by
// inheriting the target's mode — we want to inspect the symlink
// itself, then bail.
async function assertSecureTokenFile(): Promise<void> {
  let info;
  try {
    info = await lstat(tokenPath());
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return;
    throw err;
  }

  if (info.isSymbolicLink()) {
    throw new InsecureTokenError("token path is a symlink, refusing to follow");
  }
  if (!info.isFile()) {
    throw new InsecureTokenError("token path is not a regular file");
  }
  if (process.platform !== "win32") {
    const looseBits = info.mode & 0o077;
    if (looseBits !== 0) {
      const octal = (info.mode & 0o777).toString(8).padStart(3, "0");
      throw new InsecureTokenError(`mode is ${octal}, expected 600 (group/world readable)`);
    }
  }
}

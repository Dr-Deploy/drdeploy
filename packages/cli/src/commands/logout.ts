// `drdeploy logout` — wipe the local token.
//
// Server-side revocation isn't called from here yet (no /tokens/revoke
// endpoint exists). Even without revocation, removing the local file
// means this machine can't authenticate as the user anymore. A leaked
// token from another source is a separate problem (handled via the
// /settings page where the user can revoke individual tokens).

import { deleteToken } from "../lib/config.ts";

export default async function logout(): Promise<void> {
  const removed = await deleteToken();
  if (removed) {
    console.log("✓ Signed out. Token removed.");
  } else {
    console.log("Already signed out — no token on disk.");
  }
}

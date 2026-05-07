// Strict host extraction shared by `add` and `scan`.
//
// Codex flagged that the previous `extractHost` happily accepted:
//   - `https://attacker.com@victim.com`         (userinfo trick — host
//                                                resolves to victim.com,
//                                                user typed attacker.com)
//   - non-HTTP schemes (`ftp://`, `javascript:`, `file:`)
//   - inputs the URL constructor lowercases or normalizes inconsistently
//     between display and submission
//
// Since the CLI just sends a `host` string to the server (and Rails
// re-normalizes it again on Site#normalize_url_components), we want to
// extract a clean ASCII host the user clearly intended — or refuse.

export class InvalidUrlError extends Error {
  constructor(input: string, reason: string) {
    super(`Invalid URL '${input}': ${reason}`);
    this.name = "InvalidUrlError";
  }
}

export interface ParsedHost {
  /** Lowercased registrable hostname, no port, no userinfo, no path. */
  host: string;
  /** Optional port if the user provided one (left to the server to honor). */
  port: string | null;
}

export function parseHost(input: string): ParsedHost {
  const trimmed = input.trim();
  if (trimmed.length === 0) throw new InvalidUrlError(input, "empty");
  if (trimmed.length > 1024) throw new InvalidUrlError(input, "too long (>1024 chars)");

  // Anything with a colon-slash-slash is a fully-qualified URL. Anything
  // else is treated as a bare host. We add `https://` to bare hosts so
  // the URL constructor handles weird-but-valid input (Punycode, etc.)
  // consistently.
  const looksAbsolute = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed);
  const candidate = looksAbsolute ? trimmed : `https://${trimmed}`;

  let parsed: URL;
  try {
    parsed = new URL(candidate);
  } catch {
    throw new InvalidUrlError(input, "couldn't parse as a URL");
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new InvalidUrlError(input, `scheme '${parsed.protocol.replace(":", "")}' not allowed (use http or https)`);
  }
  if (parsed.username.length > 0 || parsed.password.length > 0) {
    throw new InvalidUrlError(input, "userinfo (user:pass@host) is not allowed — that's a phishing-shape URL");
  }
  if (parsed.hostname.length === 0) {
    throw new InvalidUrlError(input, "no host component");
  }

  return {
    host: parsed.hostname.toLowerCase(),
    port: parsed.port.length > 0 ? parsed.port : null
  };
}

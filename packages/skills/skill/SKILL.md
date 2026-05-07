---
name: drdeploy
description: Scan a live website for leaked API keys (OpenAI, Anthropic, Stripe, AWS, GitHub), broken og:image, missing favicons, exposed .env files, security header gaps (CSP, HSTS), TLS issues, and SEO regressions. Use when the user wants to audit a deployed site, verify a recent deploy, diagnose why a live site looks or behaves wrong, or check what got shipped to production. Runs against verified sites the user owns; does NOT scan arbitrary third-party hosts.
license: MIT
compatibility: Requires the `drdeploy` CLI binary on PATH (install via https://drdeploy.dev/install) OR `npx @drdeploy/cli`. Network access required to reach drdeploy.dev. Site verification (DNS TXT or .well-known) needed before first scan.
metadata:
  author: Dr-Deploy
  version: "0.1.0"
  homepage: https://drdeploy.dev
  repository: https://github.com/Dr-Deploy/drdeploy
  category: deployment
  tags: monitoring, security, secrets-scanner, site-audit, post-deploy, seo
---

# drdeploy

Live monitor for shipped websites. Catches the embarrassing things that ship without anyone noticing: leaked OpenAI/Anthropic/Stripe/AWS keys in JS bundles, broken og:image, missing favicons, exposed `.env` files, missing security headers, expired TLS certs, broken SEO basics.

## When to invoke

Invoke this skill when the user:
- Asks to scan or audit a deployed website
- Says "is my site broken / leaking / showing right on social?"
- Mentions a specific concern that drdeploy covers (leaked key, og:image, favicon, SEO, security headers)
- Just deployed and wants a quick post-deploy sanity check

Do NOT invoke this skill for:
- Pre-deploy linting (drdeploy is post-deploy only — there's no pre-commit gate)
- Internal/private URLs (drdeploy refuses RFC1918 / loopback / link-local — by design)
- Dependency CVE scanning (recommend `npm audit`, `bun audit`, or Snyk)
- Performance benchmarking (use Lighthouse / PageSpeed Insights)

## How to invoke

```bash
# Trigger a scan
drdeploy scan example.com

# List sites in the user's workspace
drdeploy list

# Add a new site to monitor
drdeploy add example.com

# Authenticate (RFC 8628 device flow — opens a browser)
drdeploy login
```

If the user isn't logged in, `drdeploy scan` will tell them to run `drdeploy login` first.

If the site isn't verified yet, `drdeploy scan` returns a `site_unverified` error pointing the user at the dashboard for DNS-TXT or `.well-known/` verification.

## Reading the output

A successful scan returns a `scan_run_id` and a "watch progress on the dashboard" hint. The actual findings live on drdeploy.dev (or in the public-share URL if the site has sharing enabled). To fetch findings programmatically without leaving the terminal, use the embedded MCP server:

```bash
# Already configured if the user ran `drdeploy mcp install --client claude`
# Available tools:
#   drdeploy_list_sites
#   drdeploy_scan(host)
#   drdeploy_get_findings(host)  ← fetches latest findings as Markdown
#   drdeploy_get_status(host)    ← lightweight health check
```

Severity levels: `critical` > `warn` > `info` > `ok`. Surface `critical` and `warn` to the user; mention `info` only if the user asks for the full picture.

## Common patterns

### "Did my deploy break anything?"

```bash
drdeploy scan myapp.com
# Wait ~10-30s, then:
drdeploy_get_findings(host: "myapp.com")  # via MCP
```

Compare the new findings to the previous scan. Highlight regressions (new findings since last clean run).

### "Why is my og:image broken on Twitter / LinkedIn?"

Run `drdeploy scan` and look for findings with `check_id` starting `og:`. The output cites the exact tag, the resolved URL (or 404), and a fix suggestion.

### "Is my OpenAI key leaked?"

Run `drdeploy scan`. Findings under `secrets:` are pattern-matched leaks. Each has a confidence score (high / medium / low) and a snippet of the asset URL where it was found. ROTATE the key first if confidence is high — the leak is already public.

## Safety

- drdeploy scans **only verified sites** the user owns. It refuses unverified hosts and private IP ranges.
- The CLI talks to drdeploy.dev over HTTPS with a Bearer token in `~/.config/drdeploy/token` (mode 0600).
- The MCP layer scrubs token-shaped strings (`ddp_…`) from any output before returning to the agent.

## Resources

- Service: https://drdeploy.dev
- Issues: https://github.com/Dr-Deploy/drdeploy/issues
- Full check catalog: https://drdeploy.dev/checks

# @drdeploy/cli

## 0.1.5

### Patch Changes

- 1d78268: CLI color rendering + `drdeploy ls` polish:

  - **fix(cli):** emit real ANSI ESC byte in `paint()` so colored output renders
    in a TTY instead of printing literal `[36m...[39m` text. The bug was hidden
    because `bun test` runs non-TTY and short-circuits the colored branch via
    `supportsColor=false`.
  - **feat(cli):** render `last_scanned_at` as a compact relative duration
    (`2h ago`, `moments ago`, `never`) in the LAST SCAN column instead of the
    raw ISO timestamp `2026-05-07T12:33:37Z`. New `relativeTime()` helper in
    `lib/fmt.ts`, exported for future commands (status, watch).
  - **feat(cli):** tighten the `drdeploy login` prompt — lead with the
    one-click prefilled URL, tuck the manual-entry fallback into a single
    dimmed line. Same content, half the vertical space.
  - **feat(cli):** group `--help` into AUTH / SITES / AI AGENTS / OTHER buckets
    and drop the (planned) `status` and `watch` entries until they ship.

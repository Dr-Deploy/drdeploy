// Tiny terminal output helpers. Kept here (not pulled from chalk/picocolors)
// so the compiled binary stays small and the help/list paths have zero
// surprise dependencies. Color follows the standard precedence:
//   1. NO_COLOR set (any non-empty value)  → off (https://no-color.org/)
//   2. FORCE_COLOR set (any non-empty)     → on  (https://force-color.org/)
//   3. otherwise                            → process.stdout.isTTY decides
// (piping to less, redirecting to a file, … falls through to step 3.)

function detectColorSupport(): boolean {
  const noColor = process.env["NO_COLOR"];
  if (noColor !== undefined && noColor !== "") return false;
  const forceColor = process.env["FORCE_COLOR"];
  if (forceColor !== undefined && forceColor !== "") return true;
  return Boolean(process.stdout.isTTY);
}

const supportsColor = detectColorSupport();

function paint(open: number, close: number, s: string): string {
  if (!supportsColor) return s;
  // ESC = \x1b (ASCII 27). Without this prefix the terminal sees the
  // bracket sequence as literal text and prints "[36m...[39m" instead
  // of rendering color. See `drdeploy ls` output before this fix.
  return `\x1b[${open}m${s}\x1b[${close}m`;
}

export const dim    = (s: string): string => paint(2,  22, s);
export const bold   = (s: string): string => paint(1,  22, s);
export const red    = (s: string): string => paint(31, 39, s);
export const green  = (s: string): string => paint(32, 39, s);
export const yellow = (s: string): string => paint(33, 39, s);
export const cyan   = (s: string): string => paint(36, 39, s);

/** Format an ISO timestamp as a compact relative duration. Optimised
 *  for table cells: max ~8 chars wide. Past times read "2h ago",
 *  future times read "in 3d". Falls back to the raw input on parse
 *  failure (so a string we don't recognise prints rather than vanishes). */
export function relativeTime(iso: string | null | undefined, now: number = Date.now()): string {
  if (!iso) return "—";
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return iso;

  const diffMs = t - now;
  const past = diffMs <= 0;
  const sec = Math.abs(diffMs) / 1000;

  let v: string;
  if (sec < 45)            v = "moments";
  else if (sec < 3600)     v = `${Math.round(sec / 60)}m`;
  else if (sec < 86400)    v = `${Math.round(sec / 3600)}h`;
  else if (sec < 86400*30) v = `${Math.round(sec / 86400)}d`;
  else if (sec < 86400*365)v = `${Math.round(sec / (86400*30))}mo`;
  else                     v = `${Math.round(sec / (86400*365))}y`;

  if (v === "moments") return past ? "moments ago" : "in a moment";
  return past ? `${v} ago` : `in ${v}`;
}

export interface Column<Row> {
  header: string;
  get(row: Row): string;
}

/** Render an array as a fixed-width text table. Columns auto-size to
 *  the longest cell. No wrapping, no truncation — long values stretch
 *  the column. Acceptable trade-off for the small datasets a CLI
 *  list-sites would ever surface. */
export function table<Row>(rows: readonly Row[], cols: readonly Column<Row>[]): string {
  if (rows.length === 0) return "";

  const widths = cols.map((c, i) => {
    const cellWidths = rows.map((r) => visibleLength(c.get(r)));
    return Math.max(visibleLength(c.header), ...cellWidths, 1);
  });

  const lines: string[] = [];
  // Header
  lines.push(
    cols.map((c, i) => bold(pad(c.header, widths[i]!))).join("  ")
  );
  // Separator
  lines.push(
    cols.map((_c, i) => dim("─".repeat(widths[i]!))).join("  ")
  );
  // Rows
  for (const row of rows) {
    lines.push(
      cols.map((c, i) => pad(c.get(row), widths[i]!)).join("  ")
    );
  }
  return lines.join("\n");
}

function pad(s: string, width: number): string {
  const len = visibleLength(s);
  if (len >= width) return s;
  return s + " ".repeat(width - len);
}

// Strips ANSI escape sequences and measures terminal *display width*
// (not JS string length). CJK ideographs and most emoji occupy 2
// columns; combining marks, ZWJ, and variation selectors occupy 0.
// Without this, a row containing "東京" would be reported as 2 cells
// wide instead of 4 and downstream pad() would under-pad the column.
export function visibleLength(s: string): number {
  // eslint-disable-next-line no-control-regex
  const stripped = s.replace(/\x1b\[[0-9;]*m/g, "");
  let width = 0;
  for (const ch of stripped) {
    width += charWidth(ch.codePointAt(0)!);
  }
  return width;
}

// Returns 0 / 1 / 2 cells. Hand-rolled instead of pulling string-width
// to keep the compiled binary lean. Ranges below cover Unicode 15.1
// East Asian Wide + Fullwidth blocks plus the emoji ranges that
// terminals universally render double-width. This is intentionally a
// subset of the full EAW table — good enough for CLI table output,
// not a substitute for a real Unicode library.
function charWidth(cp: number): number {
  // Control characters render as 0 (treat C0/C1 as zero-width here).
  if (cp === 0) return 0;
  if (cp < 0x20 || (cp >= 0x7f && cp < 0xa0)) return 0;

  // Combining marks, ZWJ, ZWNJ, variation selectors, BOM, etc.
  if (
    (cp >= 0x0300 && cp <= 0x036f) ||   // Combining Diacritical Marks
    (cp >= 0x200b && cp <= 0x200f) ||   // ZWSP, ZWNJ, ZWJ, LRM, RLM
    (cp >= 0x2028 && cp <= 0x202e) ||   // line/para sep, bidi controls
    (cp >= 0x2060 && cp <= 0x2064) ||   // word joiner, invisibles
    (cp >= 0xfe00 && cp <= 0xfe0f) ||   // Variation Selectors
    cp === 0xfeff ||                     // BOM
    (cp >= 0xe0100 && cp <= 0xe01ef)    // Variation Selectors Supplement
  ) {
    return 0;
  }

  // East Asian Wide + Fullwidth (covers CJK, hangul, kana, fullwidth
  // ASCII) plus the emoji blocks that any modern terminal renders 2-wide.
  if (
    (cp >= 0x1100 && cp <= 0x115f) ||   // Hangul Jamo init. consonants
    (cp >= 0x2e80 && cp <= 0x303e) ||   // CJK Radicals … punctuation
    (cp >= 0x3041 && cp <= 0x33ff) ||   // Hiragana, Katakana, Bopomofo, etc.
    (cp >= 0x3400 && cp <= 0x4dbf) ||   // CJK Extension A
    (cp >= 0x4e00 && cp <= 0x9fff) ||   // CJK Unified Ideographs
    (cp >= 0xa000 && cp <= 0xa4cf) ||   // Yi
    (cp >= 0xac00 && cp <= 0xd7a3) ||   // Hangul Syllables
    (cp >= 0xf900 && cp <= 0xfaff) ||   // CJK Compatibility Ideographs
    (cp >= 0xfe30 && cp <= 0xfe4f) ||   // CJK Compatibility Forms
    (cp >= 0xff00 && cp <= 0xff60) ||   // Fullwidth Forms
    (cp >= 0xffe0 && cp <= 0xffe6) ||   // Fullwidth signs
    (cp >= 0x1f300 && cp <= 0x1f64f) || // Misc Symbols & Pictographs, Emoticons
    (cp >= 0x1f680 && cp <= 0x1f6ff) || // Transport & Map
    (cp >= 0x1f900 && cp <= 0x1f9ff) || // Supplemental Symbols & Pictographs
    (cp >= 0x1fa70 && cp <= 0x1faff) || // Symbols & Pictographs Extended-A
    (cp >= 0x20000 && cp <= 0x2fffd) || // CJK Extensions B-F
    (cp >= 0x30000 && cp <= 0x3fffd)    // CJK Extension G
  ) {
    return 2;
  }

  return 1;
}

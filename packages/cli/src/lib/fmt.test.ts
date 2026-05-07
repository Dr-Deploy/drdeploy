import { test, expect } from "bun:test";
import { table, visibleLength, relativeTime } from "./fmt.ts";

// Force colors off so the table output contains no ANSI sequences and
// alignment is directly observable in the assertions below. (We
// intentionally do NOT export a setter from fmt.ts — colors are
// captured at module load. Setting NO_COLOR before import would only
// help if this file were the entry; instead we just assert on the
// width math, which is independent of color output.)

test("visibleLength counts CJK as width 2 (matches wcwidth)", () => {
  // "東京" is two CJK ideographs, each 2 cells wide → total 4.
  expect(visibleLength("東京")).toBe(4);
  expect(visibleLength("ab")).toBe(2);
  // Mixed: ASCII + CJK.
  expect(visibleLength("a東b")).toBe(4);
});

test("visibleLength ignores ANSI escape sequences", () => {
  // Pre-fix this was already correct; guard against regression.
  const colored = "\x1b[31m東京\x1b[39m";
  expect(visibleLength(colored)).toBe(4);
});

test("visibleLength treats combining marks as width 0", () => {
  // "é" as e + combining acute = 1 column, not 2.
  expect(visibleLength("é")).toBe(1);
});

test("relativeTime returns '—' for null/undefined/empty input", () => {
  expect(relativeTime(null)).toBe("—");
  expect(relativeTime(undefined)).toBe("—");
  expect(relativeTime("")).toBe("—");
});

test("relativeTime falls back to the raw string on unparseable input", () => {
  expect(relativeTime("not a date")).toBe("not a date");
});

test("relativeTime renders the past with an 'ago' suffix", () => {
  // Pin `now` so the assertions don't drift with wall-clock time.
  const now = Date.parse("2026-05-07T12:00:00Z");
  expect(relativeTime("2026-05-07T11:59:50Z", now)).toBe("moments ago"); // 10 sec
  expect(relativeTime("2026-05-07T11:55:00Z", now)).toBe("5m ago");      // 5 min
  expect(relativeTime("2026-05-07T10:00:00Z", now)).toBe("2h ago");      // 2 hr
  expect(relativeTime("2026-05-05T12:00:00Z", now)).toBe("2d ago");      // 2 day
  expect(relativeTime("2026-02-07T12:00:00Z", now)).toBe("3mo ago");     // ~3 mo
  expect(relativeTime("2024-05-07T12:00:00Z", now)).toBe("2y ago");      // 2 yr
});

test("relativeTime renders the future with an 'in' prefix", () => {
  const now = Date.parse("2026-05-07T12:00:00Z");
  expect(relativeTime("2026-05-07T12:00:10Z", now)).toBe("in a moment");
  expect(relativeTime("2026-05-07T12:05:00Z", now)).toBe("in 5m");
  expect(relativeTime("2026-05-08T12:00:00Z", now)).toBe("in 1d");
});

test("table aligns columns when CJK content is present", () => {
  type Row = { city: string; note: string };
  const rows: Row[] = [
    { city: "東京", note: "JP" },
    { city: "NYC",  note: "US" },
  ];
  const out = table<Row>(rows, [
    { header: "city", get: (r) => r.city },
    { header: "note", get: (r) => r.note },
  ]);

  // Strip ANSI for assertion (header/separator are styled).
  const stripped = out.replace(/\x1b\[[0-9;]*m/g, "");
  const lines = stripped.split("\n");

  // 4 lines: header, separator, row1, row2.
  expect(lines.length).toBe(4);

  // Column 1 width = max(visibleLength("city"), 4 ["東京"], 3 ["NYC"]) = 4.
  // Column 2 width = max(visibleLength("note"), 2, 2) = 4.
  // Joined with two spaces between columns. Each line's *display* width
  // (per visibleLength) must be identical: 4 + 2 + 4 = 10.
  for (const line of lines) {
    expect(visibleLength(line)).toBe(10);
  }

  // The "東京" row must end with exactly two trailing spaces in column 1
  // (4 cells - 4 width = 0 padding spaces) before the column gap, then
  // "JP" + 2 padding spaces. Pre-fix visibleLength returned 2 for "東京",
  // which would have padded with TWO extra spaces and broken alignment.
  // Asserting on the exact byte layout catches that regression:
  expect(lines[2]).toBe("東京  JP  ");
  expect(lines[3]).toBe("NYC   US  ");
});

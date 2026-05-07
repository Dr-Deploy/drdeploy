// Tiny stdlib-only prompt helpers. Dep-free on purpose — an AI-editor
// skill installer should not pull a tree of transitive deps for one Y/N.

import { createInterface, type Interface } from "node:readline";

/**
 * One-line yes/no prompt. Returns `defaultValue` if stdin is not a TTY
 * (common in CI / piped runs). Enter accepts the default.
 */
export async function ask(question: string, defaultValue: boolean): Promise<boolean> {
  if (!process.stdin.isTTY || !process.stdout.isTTY) return defaultValue;

  const suffix = defaultValue ? " (Y/n) " : " (y/N) ";
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const answer = await rlQuestion(rl, "? " + question + suffix);
    const trimmed = answer.trim().toLowerCase();
    if (trimmed === "") return defaultValue;
    return trimmed === "y" || trimmed === "yes";
  } finally {
    rl.close();
  }
}

interface Choice {
  key: string;
  label: string;
}

/**
 * Numbered choice prompt. Returns the chosen `key`. Returns
 * `defaultKey` for non-TTY input or empty answers.
 */
export async function askChoice(
  question: string,
  choices: readonly Choice[],
  defaultKey: string
): Promise<string> {
  if (!process.stdin.isTTY || !process.stdout.isTTY) return defaultKey;

  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    process.stdout.write("? " + question + "\n");
    choices.forEach((c, i) => {
      const marker = c.key === defaultKey ? "❯" : " ";
      process.stdout.write(`  ${marker} ${i + 1}) ${c.label}\n`);
    });

    const answer = await rlQuestion(rl, "  Pick a number (Enter for default): ");
    const trimmed = answer.trim();
    if (trimmed === "") return defaultKey;

    const n = Number(trimmed);
    if (!Number.isInteger(n) || n < 1 || n > choices.length) {
      process.stdout.write(`  Not a valid choice. Using default (${defaultKey}).\n`);
      return defaultKey;
    }

    const picked = choices[n - 1];
    return picked ? picked.key : defaultKey;
  } finally {
    rl.close();
  }
}

export function hasFlag(args: readonly string[], ...names: string[]): boolean {
  return args.some((a) => names.includes(a));
}

export function flagValue(args: readonly string[], name: string): string | undefined {
  const idx = args.indexOf(name);
  if (idx === -1 || idx === args.length - 1) return undefined;
  return args[idx + 1];
}

function rlQuestion(rl: Interface, q: string): Promise<string> {
  return new Promise((resolve) => rl.question(q, resolve));
}

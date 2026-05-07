#!/usr/bin/env node
// Thin Node wrapper that finds the platform-appropriate drdeploy static
// binary (downloaded by scripts/postinstall.js) and execs it with the
// caller's argv. The binary itself is the actual CLI — this wrapper exists
// only because `bin` entries on npm have to be Node-executable scripts.

import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { platform, arch } from "node:process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ext = platform === "win32" ? ".exe" : "";
const binary = join(__dirname, "..", "vendor", `drdeploy-${platform}-${arch}${ext}`);

if (!existsSync(binary)) {
  console.error(`drdeploy: binary not found at ${binary}`);
  console.error("");
  console.error("The postinstall step did not complete. Try:");
  console.error("  npm install --foreground-scripts @drdeploy/cli");
  console.error("");
  console.error("Or install via the standalone script:");
  console.error("  curl -fsSL https://drdeploy.dev/install | sh");
  process.exit(127);
}

const result = spawnSync(binary, process.argv.slice(2), { stdio: "inherit" });
if (result.error) {
  console.error(`drdeploy: failed to exec binary: ${result.error.message}`);
  process.exit(1);
}
process.exit(result.status ?? 0);

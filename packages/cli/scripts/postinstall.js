#!/usr/bin/env node
// Downloads the platform-appropriate drdeploy static binary from GitHub
// Releases and drops it in vendor/. Runs on `npm install @drdeploy/cli`.
//
// Soft-fails (exit 0) if the download fails — we never want a network blip
// to brick `npm install` for the consumer's whole project. The wrapper
// (bin/drdeploy.js) prints a recovery hint if the binary is missing at
// invocation time.
//
// Skip with: DRDEPLOY_SKIP_POSTINSTALL=1 npm install @drdeploy/cli

import { createWriteStream, existsSync, mkdirSync, chmodSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { platform, arch } from "node:process";
import https from "node:https";
import { readFileSync } from "node:fs";

if (process.env.DRDEPLOY_SKIP_POSTINSTALL) {
  console.log("drdeploy: postinstall skipped (DRDEPLOY_SKIP_POSTINSTALL set)");
  process.exit(0);
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkgPath = join(__dirname, "..", "package.json");
const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
const VERSION = pkg.version;
const REPO = "Dr-Deploy/drdeploy";

// Map Node platform/arch to our binary naming convention.
const supported = {
  "darwin-arm64": "drdeploy-darwin-arm64",
  "darwin-x64":   "drdeploy-darwin-x64",
  "linux-arm64":  "drdeploy-linux-arm64",
  "linux-x64":    "drdeploy-linux-x64"
};

const key = `${platform}-${arch}`;
const filename = supported[key];
if (!filename) {
  console.error(`drdeploy: no prebuilt binary for ${key}.`);
  console.error("Supported: " + Object.keys(supported).join(", "));
  console.error("File a request at https://github.com/Dr-Deploy/drdeploy/issues");
  process.exit(0); // soft-fail — don't break `npm install`
}

const url = `https://github.com/${REPO}/releases/download/@drdeploy/cli@${VERSION}/${filename}`;
const vendorDir = join(__dirname, "..", "vendor");
const dest = join(vendorDir, filename);

if (!existsSync(vendorDir)) mkdirSync(vendorDir, { recursive: true });

if (existsSync(dest)) {
  console.log(`drdeploy: ${filename} already present, skipping download`);
  process.exit(0);
}

console.log(`drdeploy: downloading ${filename}...`);
download(url, dest)
  .then(() => {
    chmodSync(dest, 0o755);
    console.log(`drdeploy: installed at ${dest}`);
  })
  .catch((err) => {
    console.error(`drdeploy: failed to download binary: ${err.message}`);
    console.error("The wrapper will print install hints when invoked.");
    console.error("Manual install: curl -fsSL https://drdeploy.dev/install | sh");
    process.exit(0); // soft-fail
  });

/**
 * Follow up to 5 redirects, write to dest. Reject on non-2xx after
 * redirect resolution. GitHub Releases redirects to S3-backed objects.
 */
function download(target, dest, redirectsLeft = 5) {
  return new Promise((resolve, reject) => {
    const req = https.get(target, (res) => {
      const status = res.statusCode ?? 0;

      if (status >= 300 && status < 400 && res.headers.location) {
        if (redirectsLeft <= 0) return reject(new Error("too many redirects"));
        res.resume();
        return download(res.headers.location, dest, redirectsLeft - 1).then(resolve, reject);
      }

      if (status !== 200) {
        res.resume();
        return reject(new Error(`HTTP ${status} for ${target}`));
      }

      const file = createWriteStream(dest);
      res.pipe(file);
      file.on("finish", () => file.close((err) => (err ? reject(err) : resolve())));
      file.on("error", reject);
    });
    req.on("error", reject);
    req.setTimeout(30_000, () => req.destroy(new Error("download timed out after 30s")));
  });
}

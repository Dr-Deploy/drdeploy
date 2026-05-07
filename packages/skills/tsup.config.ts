import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/cli.ts"],
  format: ["esm"],
  clean: true,
  target: "node18",
  // Single bundled output — keeps the npm install fast.
  bundle: true,
  banner: { js: "#!/usr/bin/env node" }
});

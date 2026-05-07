import { defineConfig } from "tsup";

// 4 entry points:
//   - index, tools, serve   → library exports for consumers who `import` us
//   - bin                   → npx-invokable CLI entry (`drdeploy-mcp`)
// tsup handles `.ts` extensions in imports natively (esbuild under the hood).
// External deps stay external so `npm i @drdeploy/mcp` resolves them
// against the consumer's project, not ours.
export default defineConfig({
  entry: ["src/index.ts", "src/tools.ts", "src/serve.ts", "src/bin.ts"],
  format: ["esm"],
  dts: true,
  clean: true,
  sourcemap: true,
  target: "node18",
  external: ["@modelcontextprotocol/sdk", "zod"]
});

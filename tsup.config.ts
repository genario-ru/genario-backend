import { defineConfig } from "tsup";

export default defineConfig({
  entry: [
    "src/entrypoints/server.ts",
    "src/entrypoints/workers.ts",
    "src/entrypoints/migrate.ts",
    "src/entrypoints/seed.ts",
  ],
  format: ["esm"],
  clean: true,
  minify: true,
  sourcemap: true,
  outDir: "dist",
  loader: { ".md": "text" },
});

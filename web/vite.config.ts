import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
export default defineConfig({
  base: "./",
  plugins: [
    react(),
    {
      name: "development-runtime-manifest",
      configureServer(server) {
        server.middlewares.use(async (request, response, next) => {
          const path = request.url?.split("?")[0]?.replace(/^\//, "");
          if (
            path !== "imd-deployment.json" &&
            !/^abi\/[A-Za-z0-9_-]+\.json$/.test(path ?? "")
          )
            return next();
          try {
            const content = await readFile(
              fileURLToPath(new URL("../dist/" + path, import.meta.url)),
            );
            response.setHeader("Content-Type", "application/json");
            response.end(content);
          } catch {
            response.statusCode = 503;
            response.end("Build the export first with npm run build.");
          }
        });
      },
    },
  ],
  build: {
    outDir: "../dist",
    emptyOutDir: true,
    sourcemap: false,
    target: "es2022",
  },
});

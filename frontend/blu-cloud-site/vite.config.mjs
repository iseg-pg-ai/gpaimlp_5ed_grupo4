import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

export default defineConfig(({ command }) => {
  let studioUrl;
  const root = new URL("../../", import.meta.url);
  const inStudio = process.env.SAGEMAKER_APP_TYPE === "CodeEditor";
  const configured = existsSync(new URL("config/studio.local.json", root));
  if (command === "serve" && process.env.BLU_SAGEMAKER_PROXY !== "0" && (inStudio || configured || process.env.BLU_SAGEMAKER_PROXY === "1")) {
    const python = fileURLToPath(new URL(".venv/bin/python", root));
    studioUrl = execFileSync(existsSync(python) ? python : "python3",
      [fileURLToPath(new URL("scripts/studio_urls.py", root)), "--base"],
      { encoding: "utf8", timeout: 20000 }).trim();
  }
  const behindSagemakerProxy = command === "serve" && Boolean(studioUrl);
  const sagemakerBase = studioUrl ? `${new URL(studioUrl).pathname}/ports/5173/` : "/";
  return {
  base: behindSagemakerProxy ? sagemakerBase : "/",
  build: {
    outDir: "dist/client",
  },
  optimizeDeps: {
    include: ["react", "react-dom/client"],
  },
  server: {
    host: "127.0.0.1",
    port: 5173,
    strictPort: true,
    ...(behindSagemakerProxy && studioUrl ? {
      origin: new URL(studioUrl).origin,
      hmr: { protocol: "wss", host: new URL(studioUrl).hostname, clientPort: 443 },
    } : {}),
    allowedHosts: ["terminal.local", ...(studioUrl ? [new URL(studioUrl).hostname] : [])],
    warmup: {
      clientFiles: ["./src/main.jsx"],
    },
  },
  plugins: [
    behindSagemakerProxy && {
      name: "blu-sagemaker-proxy-path",
      apply: "serve",
      configureServer(server) {
        if (studioUrl) {
          server.printUrls = () => {
            server.config.logger.info(`  ➜  Studio: ${studioUrl}/ports/5173/`);
          };
        }
        server.middlewares.use((request, _response, next) => {
          if (request.url && !request.url.startsWith(sagemakerBase)) {
            request.url = `${sagemakerBase.slice(0, -1)}${request.url.startsWith("/") ? "" : "/"}${request.url}`;
          }
          next();
        });
      },
    },
    react(),
  ].filter(Boolean),
  };
});

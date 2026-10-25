import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const sagemakerBase = "/codeeditor/default/ports/5173/";
const behindSagemakerProxy = process.env.BLU_SAGEMAKER_PROXY === "1";

export default defineConfig({
  base: behindSagemakerProxy ? sagemakerBase : "/",
  build: {
    outDir: "dist/client",
  },
  optimizeDeps: {
    include: ["react", "react-dom/client"],
  },
  server: {
    host: "0.0.0.0",
    allowedHosts: ["terminal.local", ".studio.eu-west-1.sagemaker.aws"],
    warmup: {
      clientFiles: ["./src/main.jsx"],
    },
  },
  plugins: [
    behindSagemakerProxy && {
      name: "blu-sagemaker-proxy-path",
      apply: "serve",
      configureServer(server) {
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
});

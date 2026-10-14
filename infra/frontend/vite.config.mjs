import { defineConfig } from "vite";
import { join } from "node:path";
import { ROOT, vinshcImportMap } from "./scripts/importmap.mjs";
// Keep credentials on the same origin; never expose OpenMRS to the LAN.
const target = process.env.VINSHC_BACKEND_ORIGIN || "http://127.0.0.1:8080";
const url = new URL(target);
if (
  url.protocol !== "http:" ||
  !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) ||
  url.username ||
  url.password ||
  url.pathname !== "/" ||
  url.search ||
  url.hash
) {
  throw new Error(
    "VINSHC_BACKEND_ORIGIN phải là HTTP origin loopback, không kèm đường dẫn.",
  );
}
const agentUrl = new URL(process.env.VINSHC_AGENT_ORIGIN || "http://127.0.0.1:8000");
if (agentUrl.protocol !== "http:" || !["localhost", "127.0.0.1", "[::1]"].includes(agentUrl.hostname) || agentUrl.username || agentUrl.password || agentUrl.pathname !== "/" || agentUrl.search || agentUrl.hash) throw new Error("VINSHC_AGENT_ORIGIN phải là HTTP origin loopback.");
// Dev serves every package from source; the import map (vinshcImportMap) tells the browser where
// each module lives. The build keeps @vinshc/* external: scripts/build.mjs bundles them separately.
export default defineConfig(({ command }) => ({
  plugins: [vinshcImportMap()],
  resolve:
    command === "serve"
      ? {
          alias: [
            {
              find: /^@vinshc\/core$/,
              replacement: join(ROOT, "packages/core/src/index.js"),
            },
          ],
        }
      : {},
  server: {
    fs: {
      deny: [".env", ".env.*", "*.{crt,pem}", "**/.git/**", "**/.runtime/**"],
    },
    proxy: {
      "/agent": {
        target: agentUrl.origin,
        rewrite: path => path.replace(/^\/agent/, ""),
        timeout: 100000,
        proxyTimeout: 100000,
      },
      "/openmrs": {
        target: url.origin,
        changeOrigin: true,
        timeout: 15000,
        proxyTimeout: 15000,
      },
    },
  },
  build: {
    rollupOptions: {
      input: {
        index: join(ROOT, "index.html"),
        connected: join(ROOT, "connected.html"),
        portal: join(ROOT, "portal.html"),
      },
      external: (id) => id.startsWith("@vinshc/"),
    },
  },
}));

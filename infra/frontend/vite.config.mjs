import { defineConfig } from "vite";
import { join } from "node:path";
import { ROOT, vinshcImportMap } from "./scripts/importmap.mjs";
// Keep credentials on the same origin; never expose the clinical service to the LAN.
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
// VinSHC extends OpenMRS. The product keeps a neutral /api entry point on the same origin.
const servicePrefix = process.env.VINSHC_API_UPSTREAM_PATH || "/openmrs/ws/rest/v1";
const segments = servicePrefix.split("/");
const validServicePrefix =
  servicePrefix.startsWith("/") &&
  !servicePrefix.includes("..") &&
  segments.every((segment, index) =>
    index === 0 || segment === "" || /^[a-zA-Z0-9_-]+$/.test(segment),
  );
if (!validServicePrefix)
  throw new Error("VINSHC_API_UPSTREAM_PATH phải là đường dẫn tuyệt đối trong dịch vụ.");
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
    headers: { "Cache-Control": "no-store" },
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
      "/api": {
        target: url.origin,
        changeOrigin: true,
        rewrite: path => path.replace(/^\/api(?=\/|$)/, servicePrefix.replace(/\/$/, "")),
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

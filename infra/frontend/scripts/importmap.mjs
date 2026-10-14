// Import map of the VinSHC microfrontends. The page import map is the only list of modules: the shell
// loads every "@vinshc/<name>" entry except core/shell. Dev serves sources; the build points to the
// bundles written by scripts/build.mjs (dist/importmap.json), each with a content-hash query.
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = fileURLToPath(new URL("..", import.meta.url));
export const DIST = join(ROOT, "dist");

/** Module packages under modules/ as {dir, name, version}, sorted by directory. */
export function discoverModules() {
  const base = join(ROOT, "modules");
  return readdirSync(base, { withFileTypes: true })
    .filter((d) => d.isDirectory() && existsSync(join(base, d.name, "package.json")))
    .map((d) => {
      const pkg = JSON.parse(readFileSync(join(base, d.name, "package.json"), "utf8"));
      return { dir: d.name, name: pkg.name, version: pkg.version };
    })
    .sort((a, b) => a.dir.localeCompare(b.dir));
}

export function devImportMap() {
  return {
    imports: {
      "@vinshc/core": "/packages/core/src/index.js",
      ...Object.fromEntries(
        discoverModules().map((m) => [m.name, `/modules/${m.dir}/src/index.js`]),
      ),
    },
  };
}

export function builtImportMap() {
  const file = join(DIST, "importmap.json");
  if (!existsSync(file))
    throw new Error("dist/importmap.json is missing; build with `npm run build`.");
  return JSON.parse(readFileSync(file, "utf8"));
}

export const importMapTag = (map) =>
  `<script type="importmap">\n${JSON.stringify(map, null, 2)}\n</script>`;

/** Vite plugin: injects the import map into connected.html before any module script. */
export function vinshcImportMap() {
  let command = "serve";
  return {
    name: "vinshc-import-map",
    configResolved(config) {
      command = config.command;
    },
    transformIndexHtml: {
      order: "pre",
      handler(html, { path }) {
        if (!["/connected.html", "/portal.html"].some(page => path.endsWith(page))) return html;
        const map = command === "serve" ? devImportMap() : builtImportMap();
        return {
          html,
          tags: [
            {
              tag: "script",
              attrs: { type: "importmap" },
              children: JSON.stringify(map, null, 2),
              injectTo: "head-prepend",
            },
          ],
        };
      },
    },
  };
}

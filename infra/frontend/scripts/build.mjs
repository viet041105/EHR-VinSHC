// Production build of the microfrontends.
//   node scripts/build.mjs               core + every module + host pages → dist/
//   node scripts/build.mjs --only=<key>  rebuild one package (core or a modules/<key> directory) and
//                                        update the import map of an existing dist/ in place
// Each package is an ES library with @vinshc/* kept external, so the browser shares one copy of
// @vinshc/core through the import map and a module can be redeployed without rebuilding the others.
import { build } from "vite";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  ROOT,
  DIST,
  discoverModules,
  builtImportMap,
  importMapTag,
} from "./importmap.mjs";

// Output must not depend on where npm runs the script (root or a workspace), or hashes would change.
process.chdir(ROOT);
const flag = process.argv.findIndex((arg) => arg === "--only" || arg.startsWith("--only="));
const only =
  flag < 0
    ? undefined
    : process.argv[flag].includes("=")
      ? process.argv[flag].slice("--only=".length)
      : process.argv[flag + 1];
if (flag >= 0 && !only) throw new Error("Usage: --only=<core|module directory>");
const external = (id) => id.startsWith("@vinshc/");
const packages = [
  { key: "core", name: "@vinshc/core", entry: "packages/core/src/index.js", out: "core" },
  ...discoverModules().map((m) => ({
    key: m.dir,
    name: m.name,
    entry: `modules/${m.dir}/src/index.js`,
    out: `modules/${m.dir}`,
  })),
];

async function buildPackage(pkg) {
  await build({
    configFile: false,
    root: ROOT,
    logLevel: "warn",
    build: {
      outDir: join(DIST, pkg.out),
      emptyOutDir: true,
      sourcemap: true,
      lib: {
        entry: join(ROOT, pkg.entry),
        formats: ["es"],
        fileName: () => "index.js",
      },
      rollupOptions: { external },
    },
  });
  const file = join(DIST, pkg.out, "index.js");
  const hash = createHash("sha256").update(readFileSync(file)).digest("hex").slice(0, 10);
  console.log(`built ${pkg.name} → dist/${pkg.out}/index.js (${hash})`);
  return [pkg.name, `/${pkg.out}/index.js?v=${hash}`];
}

function writeImportMap(map) {
  writeFileSync(join(DIST, "importmap.json"), JSON.stringify(map, null, 2) + "\n");
}

if (only) {
  const pkg = packages.find((p) => p.key === only);
  if (!pkg) throw new Error(`Unknown package "${only}"; use core or one of: ${packages.slice(1).map((p) => p.key).join(", ")}`);
  const map = builtImportMap();
  const [name, url] = await buildPackage(pkg);
  map.imports[name] = url;
  writeImportMap(map);
  const page = join(DIST, "connected.html");
  if (existsSync(page))
    writeFileSync(
      page,
      readFileSync(page, "utf8").replace(
        /<script type="importmap">[\s\S]*?<\/script>/,
        importMapTag(map),
      ),
    );
  console.log(`updated dist/importmap.json and dist/connected.html for ${name}`);
} else {
  rmSync(DIST, { recursive: true, force: true });
  const imports = {};
  for (const pkg of packages) {
    const [name, url] = await buildPackage(pkg);
    imports[name] = url;
  }
  writeImportMap({ imports });
  // Host pages (landing + shell). vite.config.mjs injects dist/importmap.json into connected.html.
  await build({
    root: ROOT,
    configFile: join(ROOT, "vite.config.mjs"),
    build: { emptyOutDir: false },
  });
}

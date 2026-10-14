// Discovers the microfrontends listed in the page import map and merges them into one registry.
// Deploying or removing a module only changes the import map; the shell has no list of its own.
import { createRegistry } from "@vinshc/core";

const PREFIX = "@vinshc/";
const SHARED = new Set(["@vinshc/core", "@vinshc/shell"]);

export function moduleSpecifiers(doc = globalThis.document) {
  const imports = {};
  for (const map of doc?.querySelectorAll('script[type="importmap"]') || [])
    Object.assign(imports, JSON.parse(map.textContent).imports || {});
  return Object.keys(imports).filter(
    (key) => key.startsWith(PREFIX) && !SHARED.has(key),
  );
}

/**
 * Loads every module; one that fails to load or exports no definition is reported and left out,
 * so the rest of the workspace keeps working. Conflicting definitions (same action/section id in
 * two modules) are a deployment error and reject.
 */
export async function loadModules(
  specifiers = moduleSpecifiers(),
  load = (specifier) => import(/* @vite-ignore */ specifier),
) {
  const settled = await Promise.allSettled(specifiers.map((s) => load(s)));
  const modules = [],
    failures = [];
  settled.forEach((result, index) => {
    const definition = result.status === "fulfilled" && result.value?.default;
    if (definition?.name) modules.push(definition);
    else
      failures.push({
        specifier: specifiers[index],
        error:
          result.status === "rejected"
            ? String(result.reason?.message || result.reason)
            : "module has no default export from defineModule()",
      });
  });
  for (const failure of failures)
    console.error("VinSHC module not loaded:", failure.specifier, failure.error);
  return { registry: createRegistry(modules), failures };
}

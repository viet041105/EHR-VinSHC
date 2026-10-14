// Registry of every module package in modules/, built the way the shell builds it from the import map.
import { createRegistry } from "@vinshc/core";
import { discoverModules } from "../scripts/importmap.mjs";

export const modules = await Promise.all(
  discoverModules().map((m) => import(m.name).then((loaded) => loaded.default)),
);
export const registry = createRegistry(modules);

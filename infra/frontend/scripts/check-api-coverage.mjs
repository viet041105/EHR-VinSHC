// Compare FE callers (actions, worklists and declared calls of every module) against every VinSHC
// controller mapping of the backend in this repository.
import { metadata } from "@vinshc/core";
import { registry } from "../tests/registry.mjs";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
const web = "vinshc-module/omod/src/main/java/org/openmrs/module/vinshc/web/";
// The merged backend lives in ../backend; .runtime/backend is the older exported snapshot layout.
const dir = [
  new URL("../../backend/" + web, import.meta.url),
  new URL("../.runtime/backend/infra/backend/" + web, import.meta.url),
]
  .map((u) => fileURLToPath(u))
  .find(existsSync);
if (!dir) {
  console.error("Backend controllers not found next to infra/frontend.");
  process.exit(1);
}
const { actions, worklists, calls } = registry;
const id = "11111111-1111-4111-8111-111111111111",
  field = metadata.fieldPolicies.fields[0];
const sample = {
  patient: id,
  encounter: id,
  record: id,
  group: id,
  user: id,
  facility: id,
  visit: id,
  role: "admin",
  fieldCode: field.code,
  ...(field.rowKeyRequired ? { rowKey: id } : {}),
  date: "2026-10-12",
  from: "2026-10-01",
  to: "2026-10-12",
  reason: "Contract check",
  includeHistory: "true",
  resource: "metadata_admin",
  action: "read",
  limit: "200",
  offset: "0",
};
const callers = Object.entries(actions)
  .filter(([, a]) => !a.adminCore)
  .map(([name, a]) => ({
    name,
    method: a.method || "POST",
    path: "/vinshc/" + a.path(sample).split("?")[0],
  }));
callers.push(
  ...Object.entries(worklists).map(([name, w]) => ({
    name: "worklist:" + name,
    method: "GET",
    path: "/vinshc/" + w.path({}, { patient: id }).split("?")[0],
  })),
);
callers.push(
  ...calls.map((c) => ({ name: c.module + ":" + c.name, method: c.method, path: "/vinshc/" + c.path })),
  // Patient portal calls use its own authenticated self-service API.
  { name: "portal:session", method: "GET", path: "/vinshc/portal/session" },
  { name: "portal:visits", method: "GET", path: "/vinshc/portal/visits" },
  { name: "portal:instructions", method: "GET", path: "/vinshc/portal/visits/" + id + "/instructions" },
  { name: "portal:prescriptions", method: "GET", path: "/vinshc/portal/prescriptions" },
  { name: "portal:appointments", method: "GET", path: "/vinshc/portal/appointments" },
  // Calls made by the shell itself.
  { name: "shell:login", method: "GET", path: "/session" },
  { name: "shell:loadWorkspaces", method: "GET", path: "/vinshc/authorization/workspaces" },
  { name: "shell:loadProviders", method: "GET", path: "/vinshc/providers/me" },
  { name: "shell:inspectSetup", method: "GET", path: "/vinshc/operations/configuration" },
);
let total = 0;
const missing = [];
for (const file of readdirSync(dir).filter((f) =>
  f.endsWith("Controller.java"),
)) {
  const source = readFileSync(dir + file, "utf8"),
    base = source.match(/@RequestMapping\("\/rest\/v1([^"\n]+)"\)/)?.[1];
  if (!base) continue;
  for (const match of source.matchAll(
    /@(Get|Post|Delete|Put|Patch)Mapping\((?:path\s*=\s*)?"([^"]+)"/g,
  )) {
    total++;
    const method = match[1].toUpperCase(),
      path = base + match[2],
      pattern = new RegExp("^" + path.replace(/\{[^}]+\}/g, "[^/]+") + "$");
    if (!callers.some((c) => c.method === method && pattern.test(c.path)))
      missing.push(method + " " + path);
  }
}
if (missing.length) {
  console.error("Missing FE callers:", missing);
  process.exit(1);
}
console.log(
  "PASS: FE callers cover all " +
    total +
    " VinSHC controller mappings in " +
    dir +
    ". This verifies route coverage, not runtime success of all writes or missing backend features.",
);

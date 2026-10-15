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
  userUuid: id,
  providerUuid: id,
  facilityUuid: id,
  facilityLocationUuid: id,
  locationUuid: id,
  formUuid: id,
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
  // Patient portal: the routes shell/src/portal.js and agent-chat.js really call.
  { name: "portal:me", method: "GET", path: "/vinshc/portal/me" },
  { name: "portal:password", method: "POST", path: "/vinshc/portal/password" },
  { name: "portal:visits", method: "GET", path: "/vinshc/portal/visits" },
  { name: "portal:instructions", method: "GET", path: "/vinshc/portal/visits/" + id + "/instructions" },
  { name: "portal:prescriptions", method: "GET", path: "/vinshc/portal/prescriptions" },
  { name: "portal:results", method: "GET", path: "/vinshc/portal/results" },
  { name: "portal:appointments", method: "GET", path: "/vinshc/portal/appointments" },
  // Calls made by the shell itself.
  { name: "shell:login", method: "GET", path: "/session" },
  { name: "shell:loadWorkspaces", method: "GET", path: "/vinshc/authorization/workspaces" },
  { name: "shell:changePassword", method: "POST", path: "/vinshc/staff/me/password" },
  { name: "shell:loadProviders", method: "GET", path: "/vinshc/providers/me" },
  { name: "shell:inspectSetup", method: "GET", path: "/vinshc/operations/configuration" },
);
// Backend routes that intentionally have no FE caller. Keep the reason; remove the entry when a
// screen starts using the route so this script keeps guarding it.
const noCaller = new Map([
  ["GET /vinshc/directory/facilities/{uuid}", "the facility list already carries every field the admin screens use"],
  ["GET /vinshc/portal/session", "superseded by GET portal/me"],
  ["GET /vinshc/portal/visits/{uuid}", "the portal reads instructions/prescriptions/results of a visit separately"],
  ["GET /vinshc/portal/prescriptions/{uuid}", "the portal lists prescriptions by visit"],
  ["GET /vinshc/portal/results/{uuid}", "the portal lists results by visit"],
  ["GET /vinshc/portal/attachments/{uuid}/content", "disabled by the backend until attachments are malware-scanned (checklist 8.2)"],
]);
let total = 0;
const missing = [];
const exempt = [];
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
    if (!callers.some((c) => c.method === method && pattern.test(c.path))) {
      const key = method + " " + path.replace(/\{[^}]+\}/g, "{uuid}");
      if (noCaller.has(key)) exempt.push(key + " — " + noCaller.get(key));
      else missing.push(method + " " + path);
    }
  }
}
if (missing.length) {
  console.error("Missing FE callers:", missing);
  process.exit(1);
}
if (exempt.length)
  console.log("Intentionally without FE caller:\n  " + exempt.join("\n  "));
console.log(
  "PASS: FE callers cover all " +
    total +
    " VinSHC controller mappings in " +
    dir +
    ". This verifies route coverage, not runtime success of all writes or missing backend features.",
);

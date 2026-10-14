import test from "node:test";
import assert from "node:assert/strict";
import { createRegistry, defineModule, action } from "@vinshc/core";
import { loadModules, moduleSpecifiers } from "../../shell/src/module-loader.js";
import { modules, registry } from "../registry.mjs";
import { devImportMap } from "../../scripts/importmap.mjs";

const tiny = (name, order, extra = {}) =>
  defineModule({ name, order, ...extra });

test("every module package exports a valid definition and the registry has no dangling references", () => {
  assert.equal(modules.length, 11);
  for (const module of modules) {
    assert.match(module.name, /^[a-z][a-z0-9-]*$/);
    assert.ok(Number.isFinite(module.order));
  }
  for (const section of registry.sections)
    for (const key of section.actions)
      assert.ok(registry.actions[key], `${section.id} lists unknown action ${key}`);
  for (const [key, list] of Object.entries(registry.worklists))
    assert.ok(registry.sections.some((s) => s.id === list.section), `${key} targets unknown section`);
  for (const [type, record] of Object.entries(registry.records)) {
    assert.ok(registry.sections.some((s) => s.id === record.section), `${type} targets unknown section`);
    if (record.read) assert.ok(registry.actions[record.read], `${type} reads with unknown action`);
  }
  for (const type of Object.values(registry.actionRecordTypes))
    assert.ok(registry.records[type], `unknown record type ${type}`);
  // Sidebar order is the section order, independent of the import map order.
  assert.deepEqual(
    registry.sections.map((s) => s.id),
    ["patients", "visits", "identity", "vitals", "clinical", "appointments", "queue", "billing", "orders", "pharmacy", "reports", "admin", "documents"],
  );
});

test("module order decides merges, not load order; duplicate ids are rejected", () => {
  const a = tiny("alpha", 20, {
    sections: [{ id: "one", title: "1", resource: "r", order: 20, actions: ["read"] }],
    actions: { read: action("A", "r", "read", [], () => "a", null) },
    labels: { key: "alpha" },
  });
  const b = tiny("beta", 10, {
    sections: [{ id: "two", title: "2", resource: "r", order: 10, actions: [] }],
    labels: { key: "beta" },
  });
  const merged = createRegistry([a, b]);
  assert.deepEqual(merged.sections.map((s) => s.id), ["two", "one"]);
  assert.equal(merged.labels.key, "alpha");
  assert.throws(
    () => createRegistry([a, tiny("gamma", 30, { actions: { read: a.actions.read } })]),
    /action "read" is defined by both alpha and gamma/,
  );
  assert.throws(() => defineModule({ name: "Bad Name", order: 1 }), /lowercase name/);
  assert.throws(() => defineModule({ name: "noorder" }), /numeric order/);
  assert.throws(() => defineModule({ name: "x", order: 1, sections: {} }), /sections must be an array/);
});

test("a module that fails to load is reported and the others keep working", async () => {
  const errors = console.error;
  console.error = () => {};
  try {
    const { registry: partial, failures } = await loadModules(
      ["@vinshc/ok", "@vinshc/broken", "@vinshc/empty"],
      async (specifier) => {
        if (specifier === "@vinshc/broken") throw new Error("404 Not Found");
        if (specifier === "@vinshc/empty") return {};
        return { default: tiny("ok", 1, { actions: { ping: action("Ping", "r", "read", [], () => "p", null) } }) };
      },
    );
    assert.deepEqual(Object.keys(partial.actions), ["ping"]);
    assert.deepEqual(failures.map((f) => f.specifier), ["@vinshc/broken", "@vinshc/empty"]);
    assert.match(failures[0].error, /404/);
  } finally {
    console.error = errors;
  }
});

test("the import map lists the modules; core and shell are shared, not modules", () => {
  const map = devImportMap();
  assert.equal(map.imports["@vinshc/core"], "/packages/core/src/index.js");
  assert.equal(map.imports["@vinshc/pharmacy"], "/modules/pharmacy/src/index.js");
  const doc = {
    querySelectorAll: () => [
      { textContent: JSON.stringify({ imports: { ...map.imports, "@vinshc/shell": "/s.js", other: "/o.js" } }) },
    ],
  };
  const specifiers = moduleSpecifiers(doc);
  assert.equal(specifiers.length, modules.length);
  assert.ok(!specifiers.includes("@vinshc/core") && !specifiers.includes("@vinshc/shell") && !specifiers.includes("other"));
});

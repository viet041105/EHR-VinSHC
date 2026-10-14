// Microfrontend contract. Every module package default-exports defineModule({...}); the shell loads
// the modules listed in the import map and merges them with createRegistry(). Modules never import
// each other: cross-module links (section action lists, worklist row actions, record reads) refer to
// ids and are dropped by the shell when the owning module is absent or the role lacks the privilege.
const NAME = /^[a-z][a-z0-9-]*$/;
const MAPS = ["actions", "worklists", "records", "labels", "captures", "providerFields"];
const LISTS = ["sections", "links", "calls"];

/**
 * @typedef {object} ModuleDefinition
 * @property {string} name          lowercase module name, also the import map key "@vinshc/<name>"
 * @property {string} [version]
 * @property {number} order         merge order; actions/labels of later modules win on equal keys
 * @property {object[]} [sections]  {id, title, resource, order, actions[], note, description, icon,
 *                                   records[], needsProvider, overview, partial, visible(ctx),
 *                                   intro(ctx), header(ctx), footer(ctx), bind(ctx)}
 * @property {object} [actions]     action id → action (see forms.js `action`)
 * @property {object} [worklists]   key → {section, resource, title, hint, auto, needs, filters, path, row}
 * @property {object} [records]     record type → {label, section, read, readSection, readField, idKey,
 *                                   related(r), parentFrom(r), embedded(r), clearsContextWithoutPatient}
 * @property {object[]} [links]     {key, type, priority}: a response carrying `key` belongs to that record
 * @property {object} [captures]    capture key → record type, for responses not produced by an action
 * @property {object} [providerFields] role → field names prefilled with the signed-in provider
 * @property {object} [labels]      response key → label
 * @property {object[]} [calls]     {name, method, path}: backend calls made outside actions/worklists
 * @property {Function} [onCapture] (result, ctx) after every successful response
 */
export function defineModule(definition) {
  if (!definition || !NAME.test(definition.name ?? ""))
    throw new Error("VinSHC module needs a lowercase name");
  if (!Number.isFinite(definition.order))
    throw new Error(`VinSHC module ${definition.name} needs a numeric order`);
  for (const key of MAPS)
    if (definition[key] !== undefined && (typeof definition[key] !== "object" || Array.isArray(definition[key])))
      throw new Error(`VinSHC module ${definition.name}: ${key} must be an object`);
  for (const key of LISTS)
    if (definition[key] !== undefined && !Array.isArray(definition[key]))
      throw new Error(`VinSHC module ${definition.name}: ${key} must be an array`);
  return Object.freeze({
    version: "0.0.0",
    sections: [],
    actions: {},
    worklists: {},
    records: {},
    links: [],
    captures: {},
    providerFields: {},
    labels: {},
    calls: [],
    ...definition,
  });
}

export function createRegistry(modules) {
  const registry = {
    modules: [],
    sections: [],
    actions: {},
    worklists: {},
    sectionWorklists: {},
    records: {},
    recordLinks: [],
    actionRecordTypes: {},
    responseTypes: {},
    providerFields: {},
    labels: {},
    calls: [],
    captureHooks: [],
  };
  const owners = new Map();
  const claim = (kind, key, owner) => {
    const id = kind + ":" + key;
    if (owners.has(id))
      throw new Error(`${kind} "${key}" is defined by both ${owners.get(id)} and ${owner}`);
    owners.set(id, owner);
  };
  for (const module of [...modules].sort((a, b) => a.order - b.order)) {
    claim("module", module.name, module.name);
    registry.modules.push({ name: module.name, version: module.version });
    for (const section of module.sections) {
      claim("section", section.id, module.name);
      registry.sections.push({ order: module.order, ...section, actions: [...(section.actions || [])], module: module.name });
    }
    for (const [key, action] of Object.entries(module.actions)) {
      claim("action", key, module.name);
      registry.actions[key] = action;
      if (action.record) registry.actionRecordTypes[key] = action.record;
      if (action.captures) {
        claim("capture", key, module.name);
        registry.responseTypes[key] = action.captures;
      }
    }
    for (const [key, type] of Object.entries(module.captures)) {
      claim("capture", key, module.name);
      registry.responseTypes[key] = type;
    }
    for (const [key, list] of Object.entries(module.worklists)) {
      claim("worklist", key, module.name);
      registry.worklists[key] = list;
      (registry.sectionWorklists[list.section] ||= []).push(key);
    }
    for (const [type, record] of Object.entries(module.records)) {
      claim("record", type, module.name);
      registry.records[type] = record;
    }
    registry.recordLinks.push(...module.links);
    for (const [role, fields] of Object.entries(module.providerFields))
      registry.providerFields[role] = [...new Set([...(registry.providerFields[role] || []), ...fields])];
    Object.assign(registry.labels, module.labels);
    registry.calls.push(...module.calls.map((call) => ({ ...call, module: module.name })));
    if (module.onCapture) registry.captureHooks.push(module.onCapture);
  }
  registry.sections.sort((a, b) => a.order - b.order);
  registry.recordLinks.sort((a, b) => a.priority - b.priority);
  return registry;
}

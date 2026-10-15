import { uuid } from "./backend-client.js";

// Only successful backend responses enter this store. It lives in one workspace in memory.
// Record types, links between records and per-action side effects come from the module registry
// (records, recordLinks, actions, actionRecordTypes, responseTypes), so the store knows no domain.
const valid = (value) => {
  try {
    return uuid(value);
  } catch {
    return null;
  }
};
const usable = (response) =>
  response && typeof response === "object" && !Array.isArray(response);
export class WorkspaceMemory {
  constructor(registry = {}) {
    this.configure(registry);
    this.clear();
  }
  configure({
    records = {},
    recordLinks = [],
    actions = {},
    actionRecordTypes = {},
    responseTypes = {},
  } = {}) {
    this.recordTypes = records;
    this.recordLinks = recordLinks;
    this.actionDefinitions = actions;
    this.actionRecordTypes = actionRecordTypes;
    this.responseTypes = responseTypes;
  }
  clear() {
    this.context = {};
    this.contextLabel = "";
    this.records = new Map();
    this.selected = {};
  }
  setContext(values) {
    const next = Object.fromEntries(
      ["patient", "visit", "encounter"]
        .filter((k) => values[k])
        .map((k) => [k, uuid(values[k])]),
    );
    // An explicit context replacement cannot retain identifiers from the previous patient.
    if (next.patient !== this.context.patient) this.contextLabel = "";
    this.context = next;
  }
  idOf(type, response) {
    return valid(response[this.recordTypes[type]?.idKey || "uuid"] ?? response.uuid);
  }
  /** The first registered link whose key the record carries, e.g. billUuid → bill. */
  linkOf(data) {
    return this.recordLinks.find((link) => data[link.key]);
  }
  remember(type, response) {
    if (!usable(response)) return;
    const id = this.idOf(type, response);
    if (!id) return;
    const key = type + ":" + id;
    this.records.delete(key);
    this.records.set(key, {
      type,
      id,
      data: response,
      openedAt: new Date().toISOString(),
    });
    if (this.records.size > 100)
      this.records.delete(this.records.keys().next().value);
  }
  capture(action, response, input = {}) {
    if (!usable(response)) return;
    const type = this.responseTypes[action],
      definition = this.recordTypes[type] || {},
      actionDefinition = this.actionDefinitions[action] || {};
    for (const [related, data] of definition.related?.(response) || [])
      this.remember(related, data);
    const link = this.linkOf(response);
    const parent = link
      ? this.records.get(link.type + ":" + response[link.key])
      : definition.parentFrom
        ? { data: definition.parentFrom(response) }
        : null;
    const patient = valid(
      response.patientUuid ||
        response.patient ||
        parent?.data.patientUuid ||
        input.patient,
    );
    const encounter = valid(
      response.encounterUuid ||
        response.encounter ||
        parent?.data.encounterUuid ||
        input.encounter,
    );
    const visit = valid(
      response.visitUuid || parent?.data.visitUuid || input.visit,
    );
    if (!patient && definition.clearsContextWithoutPatient) {
      this.context = {};
      this.selected = {};
    }
    if (patient) {
      if (this.context.patient !== patient) {
        this.context = { patient };
        this.contextLabel = "";
        this.selected = {};
      }
      if (encounter && this.context.encounter !== encounter) {
        delete this.context.visit;
        this.context.encounter = encounter;
        this.selected = {};
      }
      if (visit && this.context.visit !== visit) {
        if (!encounter) delete this.context.encounter;
        this.context.visit = visit;
        this.selected = {};
      }
      if (Object.hasOwn(response, "visitUuid") && response.visitUuid === null)
        delete this.context.visit;
    }
    if (type) {
      this.remember(type, response);
      const id = this.idOf(type, response);
      if (id) this.selected[type] = id;
    }
    const stale = actionDefinition.marksStale?.(response, input);
    if (stale) {
      const row = this.records.get(stale);
      if (row) row.stale = true;
    }
    for (const [embedded, data] of actionDefinition.embedded?.(response) || [])
      this.remember(embedded, data);
    for (const [embedded, data] of definition.embedded?.(response) || [])
      this.remember(embedded, data);
  }
  list(types) {
    return [...this.records.values()]
      .filter((row) => types.includes(row.type))
      .reverse();
  }
  select(type, id) {
    const row = this.records.get(type + ":" + id);
    if (!row) return null;
    const link = this.linkOf(row.data);
    const parent = link ? this.records.get(link.type + ":" + row.data[link.key]) : null;
    const source = row.data.patientUuid ? row.data : parent?.data || {};
    const context = this.recordTypes[type]?.contextFrom?.(row.data) || {};
    const patient = valid(context.patient || source.patientUuid),
      visit = valid(context.visit || source.visitUuid),
      encounter = valid(context.encounter || source.encounterUuid);
    this.setContext({ patient, visit, encounter });
    this.selected = { [type]: row.id };
    for (const { key, type: linked } of this.recordLinks)
      if (row.data[key]) this.selected[linked] = valid(row.data[key]);
    return row;
  }
  defaults(action) {
    const type = this.actionRecordTypes[action];
    return {
      ...this.context,
      ...(type && this.selected[type] ? { record: this.selected[type] } : {}),
    };
  }
}

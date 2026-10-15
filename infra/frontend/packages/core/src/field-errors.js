// Shows the browser's own validation message next to the field and links it for assistive technology.
// It never validates, changes a message, prevents a submit or touches form values: it only mirrors
// `validationMessage` when the browser fires `invalid`, and removes the note once the field is valid.
let sequence = 0;
const installed = new WeakSet();

const isControl = (el) =>
  el instanceof HTMLElement &&
  el.matches("input, select, textarea") &&
  el.type !== "hidden";

function noteFor(el) {
  const id = el.dataset.fieldErrorId;
  return id ? el.ownerDocument.getElementById(id) : null;
}

function describedBy(el, id, add) {
  const ids = (el.getAttribute("aria-describedby") || "").split(/\s+/).filter((v) => v && v !== id);
  if (add) ids.push(id);
  if (ids.length) el.setAttribute("aria-describedby", ids.join(" "));
  else el.removeAttribute("aria-describedby");
}

function show(el) {
  let note = noteFor(el);
  if (!note) {
    note = el.ownerDocument.createElement("small");
    note.id = el.dataset.fieldErrorId = `field-error-${++sequence}`;
    note.className = "field-error";
    el.insertAdjacentElement("afterend", note);
  }
  note.textContent = el.validationMessage;
  el.setAttribute("aria-invalid", "true");
  describedBy(el, note.id, true);
}

function clear(el) {
  const note = noteFor(el);
  if (note) {
    describedBy(el, note.id, false);
    note.remove();
  }
  delete el.dataset.fieldErrorId;
  el.removeAttribute("aria-invalid");
}

/** Installs the listeners once per document (capture phase, since `invalid` does not bubble). */
export function installFieldErrors(root = globalThis.document) {
  if (!root || installed.has(root)) return;
  installed.add(root);
  root.addEventListener("invalid", (event) => {
    if (isControl(event.target)) show(event.target);
  }, true);
  const update = (event) => {
    const el = event.target;
    if (!isControl(el) || !el.dataset.fieldErrorId) return;
    if (el.validity.valid) clear(el);
    else show(el);
  };
  root.addEventListener("input", update, true);
  root.addEventListener("change", update, true);
}

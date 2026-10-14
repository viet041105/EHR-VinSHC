// Generic rendering of a backend response in the result panel.
import { RESULT_LABELS, esc, stateText } from "@vinshc/core";

const HIDDEN = ["memberUuids", "packSha256", "upstreamBoundaries", "adapterStrategy"];

/** Labels: shared response labels, then module labels, then field labels of registered actions. */
export function resultLabels(registry) {
  const fields = Object.fromEntries(
    Object.values(registry.actions).flatMap((a) =>
      a.fields.map((f) => [f.name, f.label]),
    ),
  );
  return { ...fields, ...registry.labels, ...RESULT_LABELS };
}
export function displayResult(value, labels, depth = 0) {
  if (value === null || value === undefined)
    return '<span class="readonly">Chưa ghi nhận</span>';
  if (typeof value !== "object")
    return esc(
      typeof value === "boolean" ? (value ? "Có" : "Không") : stateText(value),
    );
  if (Array.isArray(value))
    return value.length
      ? `<div class="result-list">${value.map((v) => `<article>${displayResult(v, labels, depth + 1)}</article>`).join("")}</div>`
      : '<p class="readonly">Chưa có bản ghi.</p>';
  return `<dl class="result-fields">${Object.entries(value)
    .filter(([k]) => !HIDDEN.includes(k))
    .map(
      ([k, v]) =>
        `<div><dt>${esc(labels[k] || k)}</dt><dd>${typeof v === "number" && /(Vnd|_vnd)$/.test(k) ? esc(new Intl.NumberFormat("vi-VN").format(v)) : displayResult(v, labels, depth + 1)}</dd></div>`,
    )
    .join("")}</dl>`;
}

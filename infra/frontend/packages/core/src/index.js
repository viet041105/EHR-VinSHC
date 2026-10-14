// @vinshc/core: the only library shared by the shell and every module. The import map serves a
// single copy, so state such as the BackendClient instance is created by the shell and handed to
// modules through the context object instead of module-level singletons.
import "./clear-demo.js";
export {
  BackendClient,
  BackendError,
  isSystemAdministrator,
  uuid,
  instant,
  money,
  vitalsPayload,
  VITAL_LIMITS,
} from "./backend-client.js";
export {
  BACKEND_SERVICES,
  VITAL_FIELD_MAP,
  buildVitalsCommand,
} from "./backend-mapping.js";
export {
  metadata,
  active,
  permitted,
  assignedRoles,
  facilityForLocation,
} from "./metadata.js";
export { clearLegacyDemo } from "./clear-demo.js";
export {
  F,
  choice,
  options,
  optional,
  id,
  pick,
  body,
  action,
  printAction,
  stateText,
  states,
  serviceOptions,
  workflowConfigOptions,
  codeList,
} from "./forms.js";
export {
  esc,
  qs,
  formatVnd,
  formatTime,
  patientLabel,
  patientIdentity,
  go,
  statusFilter,
  note,
  pendingBadge,
  CONNECTED_BADGE,
  openButton,
  emptyState,
  preparationPanel,
} from "./ui.js";
export { RESULT_LABELS } from "./labels.js";
export { WorkspaceMemory } from "./workspace-model.js";
export { defineModule, createRegistry } from "./registry.js";

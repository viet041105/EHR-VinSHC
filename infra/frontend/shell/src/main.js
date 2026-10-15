// Entry of connected.html. The login screen renders immediately; the workspace waits for the modules.
import { loadModules } from "./module-loader.js";
import { startShell } from "./app.js";
import { installFieldErrors } from "@vinshc/core";

installFieldErrors();

startShell(loadModules());

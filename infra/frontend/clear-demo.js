// Remove only the legacy VinSHC demo stores; never clear unrelated application data.
export function clearLegacyDemo(storage) {
  for (const key of ["vinshc-demo-v1", "vinshc-demo-v2"]) {
    try {
      storage?.removeItem(key);
    } catch {
      /* A denied browser store must not prevent API login. */
    }
  }
}
if (typeof window !== "undefined") {
  try {
    clearLegacyDemo(window.localStorage);
  } catch {}
}

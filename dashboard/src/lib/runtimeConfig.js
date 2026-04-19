const normalizeBase = (value) => {
  if (!value) return "";
  return value.endsWith("/") ? value.slice(0, -1) : value;
};

const legacyDemoFlag = (import.meta.env.VITE_ENABLE_DEMO_MODE ?? "").toLowerCase();
const rawAppMode = (import.meta.env.VITE_APP_MODE ?? "").toLowerCase();

export const appMode = rawAppMode || (legacyDemoFlag === "true" ? "demo" : "prod");
export const apiBaseUrl = normalizeBase(import.meta.env.VITE_API_BASE_URL ?? "");
export const wsUrlOverride = import.meta.env.VITE_WS_URL ?? "";
export const isDemoModeEnabled = appMode === "demo";
export const isDemoAuthBypassEnabled =
  isDemoModeEnabled && (import.meta.env.VITE_DEMO_AUTH_BYPASS ?? "false").toLowerCase() === "true";
export const googleMapsApiKey = (import.meta.env.VITE_GOOGLE_MAPS_API_KEY ?? "").trim();

export function buildApiPath(path) {
  if (!path.startsWith("/")) {
    throw new Error(`API path must start with '/': ${path}`);
  }
  return apiBaseUrl ? `${apiBaseUrl}${path}` : path;
}

export function resolveWsUrl() {
  if (wsUrlOverride) return wsUrlOverride;
  if (typeof window === "undefined") return "";
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  if (apiBaseUrl) {
    const mapped = apiBaseUrl.replace(/^http/i, "ws");
    return `${mapped}/ws/live`;
  }
  return `${protocol}//${window.location.host}/api/ws/live`;
}

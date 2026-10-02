// Display preferences are independent of the farm save. Resetting the farm
// never resets brightness, and older save schemas need no migration.
export const BRIGHTNESS_KEY = "farmy-display-brightness-v1";
export const DEFAULT_BRIGHTNESS = 100;
export const MIN_BRIGHTNESS = 50;
export const MAX_BRIGHTNESS = 150;
export const BRIGHTNESS_STEP = 5;

export function normalizeBrightness(value) {
  if ((typeof value !== "number" && typeof value !== "string") ||
      (typeof value === "string" && value.trim() === "")) return DEFAULT_BRIGHTNESS;
  const number = Number(value);
  if (!Number.isFinite(number)) return DEFAULT_BRIGHTNESS;
  return Math.min(MAX_BRIGHTNESS, Math.max(MIN_BRIGHTNESS,
    Math.round(number / BRIGHTNESS_STEP) * BRIGHTNESS_STEP));
}

// Pure conversion for the renderer: 100% retains Farmy's original exposure.
export function exposureForBrightness(value, baseExposure = .76) {
  return baseExposure * normalizeBrightness(value) / DEFAULT_BRIGHTNESS;
}

export function loadBrightness(storage) {
  try {
    const store = storage ?? globalThis.localStorage;
    const saved = store.getItem(BRIGHTNESS_KEY);
    return saved === null ? DEFAULT_BRIGHTNESS : normalizeBrightness(saved);
  } catch {
    return DEFAULT_BRIGHTNESS; // Blocked storage/private mode.
  }
}

export function saveBrightness(value, storage) {
  try {
    const store = storage ?? globalThis.localStorage;
    store.setItem(BRIGHTNESS_KEY, String(normalizeBrightness(value)));
    return true;
  } catch {
    return false; // Scene adjustments still work during this session.
  }
}

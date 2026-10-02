import test from "node:test";
import assert from "node:assert/strict";
import {
  BRIGHTNESS_KEY, DEFAULT_BRIGHTNESS, MIN_BRIGHTNESS, MAX_BRIGHTNESS,
  normalizeBrightness, exposureForBrightness, loadBrightness, saveBrightness,
} from "../src/game/settings.js";

function memoryStorage() {
  const values = new Map();
  return {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: key => values.delete(key),
  };
}

test("brightness has a safe default and accepts slider increments", () => {
  const storage = memoryStorage();
  assert.equal(loadBrightness(storage), DEFAULT_BRIGHTNESS);
  assert.equal(MIN_BRIGHTNESS, 50);
  assert.equal(MAX_BRIGHTNESS, 150);
  assert.equal(normalizeBrightness("125"), 125);
  assert.equal(normalizeBrightness(97), 95);
  assert.equal(normalizeBrightness(999), MAX_BRIGHTNESS);
  assert.equal(normalizeBrightness(-4), MIN_BRIGHTNESS);
  for (const invalid of ["bad", "", " ", null, undefined, NaN, Infinity, {}, []]) {
    assert.equal(normalizeBrightness(invalid), DEFAULT_BRIGHTNESS);
  }
});

test("scene exposure retains the original warm baseline at 100 percent", () => {
  assert.equal(exposureForBrightness(100), .76);
  assert.equal(exposureForBrightness(50), .38);
  assert.equal(exposureForBrightness(150), 1.14);
  assert.equal(exposureForBrightness(80, 1), .8);
});

test("saved brightness round-trips under a separate key from farm progress", () => {
  const storage = memoryStorage();
  storage.setItem("farmy-save-v1", '{"version":3,"coins":123}');
  assert.equal(saveBrightness(135, storage), true);
  assert.equal(storage.getItem(BRIGHTNESS_KEY), "135");
  assert.equal(loadBrightness(storage), 135);
  assert.equal(storage.getItem("farmy-save-v1"), '{"version":3,"coins":123}');
  assert.equal(saveBrightness(100, storage), true);
  assert.equal(loadBrightness(storage), 100);
});

test("invalid persisted settings and unavailable browser storage fail safely", () => {
  const storage = memoryStorage();
  storage.setItem(BRIGHTNESS_KEY, "broken");
  assert.equal(loadBrightness(storage), DEFAULT_BRIGHTNESS);
  storage.setItem(BRIGHTNESS_KEY, "9999");
  assert.equal(loadBrightness(storage), MAX_BRIGHTNESS);
  const blocked = { getItem() { throw Error("blocked"); }, setItem() { throw Error("blocked"); } };
  assert.equal(loadBrightness(blocked), DEFAULT_BRIGHTNESS);
  assert.equal(saveBrightness(115, blocked), false);
});

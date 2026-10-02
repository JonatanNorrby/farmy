import { CROPS, FARM, PLOT_COUNT } from "../config/crops.js";
import { newFarm, SAVE_VERSION } from "./farm.js";

// The original browser storage key stays stable through schema upgrades.
export const SAVE_KEY = "farmy-save-v1";

export function loadFarm(storage = globalThis.localStorage) {
  try {
    const raw = JSON.parse(storage.getItem(SAVE_KEY));
    if (!raw || ![1, 2, 3, SAVE_VERSION].includes(raw.version) ||
        !Array.isArray(raw.plots) || raw.plots.length !== PLOT_COUNT) return newFarm();
    // v1 predates expansion, so all twenty old farm plots were available.
    const unlockedRows = raw.version === 1 ? FARM.rows : raw.unlockedRows;
    if (!Number.isInteger(unlockedRows) || unlockedRows < FARM.initialRows || unlockedRows > FARM.rows) return newFarm();
    if (!Number.isSafeInteger(raw.coins) || raw.coins < 0 ||
        !Number.isSafeInteger(raw.harvested) || raw.harvested < 0) return newFarm();

    const ownedCount = unlockedRows * FARM.columns;
    // Prior to v4, ALL owned cells were already tilled. Preserve those plots
    // exactly, whether empty, planted with discontinued crops, or sprinklers.
    const tilled = raw.version === SAVE_VERSION
      ? raw.tilled
      : Array.from({ length: PLOT_COUNT }, (_, index) => index < ownedCount);
    if (!Array.isArray(tilled) || tilled.length !== PLOT_COUNT ||
        tilled.some((prepared, index) => typeof prepared !== "boolean" || (index >= ownedCount && prepared))) return newFarm();

    const plots = raw.plots.map(plot => {
      if (plot === null) return null;
      if (raw.version >= 3 && plot?.kind === "sprinkler") {
        if (Object.keys(plot).length !== 1) throw new Error("Invalid sprinkler");
        return { kind: "sprinkler" };
      }
      if (!plot || !Object.hasOwn(CROPS, plot.cropId) ||
          !Number.isFinite(plot.plantedAt) || !Number.isFinite(plot.readyAt) ||
          plot.plantedAt < 0 || plot.readyAt <= plot.plantedAt || typeof plot.watered !== "boolean") throw new Error("Invalid plot");
      return { cropId: plot.cropId, plantedAt: plot.plantedAt, readyAt: plot.readyAt, watered: plot.watered };
    });
    if (plots.some((plot, index) => plot !== null && !tilled[index])) return newFarm();
    return { version: SAVE_VERSION, coins: raw.coins, harvested: raw.harvested, unlockedRows, tilled, plots };
  } catch {
    return newFarm();
  }
}

export function saveFarm(state, storage = globalThis.localStorage) {
  try { storage.setItem(SAVE_KEY, JSON.stringify(state)); return true; }
  catch { return false; } // Storage may be disabled or full.
}

export function clearFarm(storage = globalThis.localStorage) {
  try { storage.removeItem(SAVE_KEY); } catch { /* Storage can be unavailable. */ }
}

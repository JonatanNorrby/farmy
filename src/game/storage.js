import { CROPS, FARM, LEGACY_GRID, LEGACY_PLOT_COUNT, legacyPlotPosition } from "../config/crops.js";
import { newFarm, SAVE_VERSION, onLand, roundPosition } from "./farm.js";
import { LEGACY_STARTER_STOCK, validStock } from "../config/shop.js";

// Retain the key through migrations so existing gardens are not lost.
export const SAVE_KEY = "farmy-save-v1";
function validContent(content, supportsSprinkler) {
  if (content === null) return null;
  if (supportsSprinkler && content?.kind === "sprinkler") {
    if (Object.keys(content).length !== 1) throw Error("Invalid sprinkler");
    return { kind: "sprinkler" };
  }
  if (!content || !Object.hasOwn(CROPS, content.cropId) ||
      !Number.isFinite(content.plantedAt) || !Number.isFinite(content.readyAt) ||
      content.plantedAt < 0 || content.readyAt <= content.plantedAt ||
      typeof content.watered !== "boolean") throw Error("Invalid crop");
  return { cropId: content.cropId, plantedAt: content.plantedAt,
    readyAt: content.readyAt, watered: content.watered };
}
function validEconomy(raw) {
  return Number.isSafeInteger(raw.coins) && raw.coins >= 0 &&
    Number.isSafeInteger(raw.harvested) && raw.harvested >= 0;
}
function validLevel(level) {
  return Number.isInteger(level) && level >= FARM.initialLevel && level <= FARM.maxLevel;
}
function readCurrent(raw) {
  if (!validLevel(raw.landLevel) || !Array.isArray(raw.patches) ||
      raw.patches.length > FARM.maxPatches) return null;
  // v5 had no shop: grant one starting bag without charging or altering the
  // previous coins, crops, sprinklers or prepared ground.
  const inventory = raw.version === SAVE_VERSION ? raw.inventory : { ...LEGACY_STARTER_STOCK };
  if (!validStock(inventory)) return null;
  const state = { version: SAVE_VERSION, coins: raw.coins, harvested: raw.harvested,
    landLevel: raw.landLevel, inventory: { ...inventory }, patches: [] };
  for (const patch of raw.patches) {
    if (!patch || !Number.isFinite(patch.x) || !Number.isFinite(patch.z) ||
        !onLand(state, patch, FARM.patchRadius)) return null;
    const x = roundPosition(patch.x), z = roundPosition(patch.z);
    if (state.patches.some(other => Math.hypot(other.x - x, other.z - z) < FARM.brushSpacing - .025)) return null;
    state.patches.push({ x, z, content: validContent(patch.content, true) });
  }
  return state;
}
function readLegacy(raw) {
  if (!Array.isArray(raw.plots) || raw.plots.length !== LEGACY_PLOT_COUNT) return null;
  const landLevel = raw.version === 1 ? FARM.maxLevel : raw.unlockedRows;
  if (!validLevel(landLevel)) return null;
  const count = landLevel * LEGACY_GRID.columns;
  const tilled = raw.version === 4 ? raw.tilled :
    Array.from({ length: LEGACY_PLOT_COUNT }, (_, index) => index < count);
  if (!Array.isArray(tilled) || tilled.length !== LEGACY_PLOT_COUNT ||
      tilled.some((prepared, index) => typeof prepared !== "boolean" || (index >= count && prepared))) return null;
  const patches = [];
  for (let index = 0; index < LEGACY_PLOT_COUNT; index++) {
    const content = validContent(raw.plots[index], raw.version >= 3);
    if (content !== null && !tilled[index]) return null;
    if (tilled[index]) patches.push({ ...legacyPlotPosition(index), content });
  }
  return { version: SAVE_VERSION, coins: raw.coins, harvested: raw.harvested, landLevel,
    inventory: { ...LEGACY_STARTER_STOCK }, patches };
}
export function loadFarm(storage = globalThis.localStorage) {
  try {
    const raw = JSON.parse(storage.getItem(SAVE_KEY));
    if (!raw || ![1, 2, 3, 4, 5, SAVE_VERSION].includes(raw.version) || !validEconomy(raw)) return newFarm();
    return (raw.version === SAVE_VERSION ? readCurrent(raw) : readLegacy(raw)) ?? newFarm();
  } catch {
    return newFarm();
  }
}
export function saveFarm(state, storage = globalThis.localStorage) {
  try { storage.setItem(SAVE_KEY, JSON.stringify(state)); return true; }
  catch { return false; }
}
export function clearFarm(storage = globalThis.localStorage) {
  try { storage.removeItem(SAVE_KEY); } catch { /* Storage can be unavailable. */ }
}

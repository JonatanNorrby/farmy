import { CROPS, FARM, LEGACY_GRID, LEGACY_PLOT_COUNT, legacyPlotPosition } from "../config/crops.js";
import { newFarm, SAVE_VERSION, onLand, isPrepared, roundPosition } from "./farm.js";
import { LEGACY_STARTER_STOCK, validStock } from "../config/shop.js";
import { EMPTY_HARVEST_BAG, validHarvestBag } from "../config/harvest.js";

// Keep the original browser key through all save format migrations.
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
const validLevel = level => Number.isInteger(level) &&
  level >= FARM.initialLevel && level <= FARM.maxLevel;
function position(point) {
  if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.z)) throw Error("Invalid position");
  return { x: roundPosition(point.x), z: roundPosition(point.z) };
}
function sufficientlyApart(list, candidate, spacing) {
  return list.every(other => Math.hypot(other.x - candidate.x, other.z - candidate.z) >= spacing - .025);
}
function baseState(raw) {
  const inventory = raw.version >= 6 ? raw.inventory : { ...LEGACY_STARTER_STOCK };
  const harvestBag = raw.version >= 7 ? raw.harvestBag : { ...EMPTY_HARVEST_BAG };
  if (!validStock(inventory) || !validHarvestBag(harvestBag)) throw Error("Invalid economy");
  return { version: SAVE_VERSION, coins: raw.coins, harvested: raw.harvested,
    landLevel: raw.landLevel, inventory: { ...inventory }, harvestBag: { ...harvestBag },
    soil: [], plants: [], sprinklers: [] };
}
function addSoil(state, stamp) {
  const p = position(stamp);
  if (!onLand(state, p, FARM.patchRadius) ||
      !sufficientlyApart(state.soil, p, FARM.brushSpacing)) throw Error("Invalid soil geometry");
  state.soil.push(p);
}
function addContent(state, point, content) {
  const p = position(point);
  if (!onLand(state, p) || !isPrepared(state, p)) throw Error("Content outside painted soil");
  if (content?.kind === "sprinkler") {
    if (!sufficientlyApart(state.sprinklers, p, FARM.seedSpacing) ||
        !sufficientlyApart(state.plants, p, FARM.seedSpacing)) throw Error("Overlapping building");
    state.sprinklers.push(p);
  } else if (content !== null) {
    if (!sufficientlyApart(state.plants, p, FARM.seedSpacing) ||
        !sufficientlyApart(state.sprinklers, p, FARM.seedSpacing)) throw Error("Overlapping crop");
    state.plants.push({ ...p, ...content });
  }
}
function readCurrent(raw) {
  if (!validLevel(raw.landLevel)) return null;
  const state = baseState(raw);
  if (raw.version === SAVE_VERSION) {
    if (!Array.isArray(raw.soil) || !Array.isArray(raw.plants) || !Array.isArray(raw.sprinklers) ||
        raw.soil.length > FARM.maxPatches || raw.plants.length > FARM.maxPlants ||
        raw.sprinklers.length > FARM.maxSprinklers) return null;
    for (const mark of raw.soil) addSoil(state, mark);
    // Verify entire content set independent of ordering (even on crafted saves).
    for (const item of raw.plants) {
      const crop = validContent(item, false);
      if (!crop) throw Error("Empty crop");
      addContent(state, item, crop);
    }
    for (const item of raw.sprinklers) addContent(state, item, { kind: "sprinkler" });
    return state;
  }
  // v5-v7 represent crops as contents of prepared soil marks. Split them
  // into independent entity coordinates, preserving all timers and buildings.
  if (!Array.isArray(raw.patches) || raw.patches.length > FARM.maxPatches) return null;
  for (const patch of raw.patches) addSoil(state, patch);
  for (const patch of raw.patches) addContent(state, patch, validContent(patch.content, true));
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
  const state = baseState({ ...raw, landLevel });
  for (let i = 0; i < LEGACY_PLOT_COUNT; i++) {
    if (tilled[i]) addSoil(state, legacyPlotPosition(i));
    else if (raw.plots[i] !== null) throw Error("Crop on locked soil");
  }
  for (let i = 0; i < LEGACY_PLOT_COUNT; i++) {
    const content = validContent(raw.plots[i], raw.version >= 3);
    if (content !== null) addContent(state, legacyPlotPosition(i), content);
  }
  return state;
}
export function loadFarm(storage = globalThis.localStorage) {
  try {
    const raw = JSON.parse(storage.getItem(SAVE_KEY));
    if (!raw || ![1, 2, 3, 4, 5, 6, 7, SAVE_VERSION].includes(raw.version) || !validEconomy(raw)) return newFarm();
    return (raw.version >= 5 ? readCurrent(raw) : readLegacy(raw)) ?? newFarm();
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

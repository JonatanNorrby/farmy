import { CROPS, FARM, SPRINKLER, PLANTABLE_CROPS, STARTER_PATCHES, landBounds } from "../config/crops.js";
import { INITIAL_STOCK, MAX_STOCK, SHOP_ITEMS } from "../config/shop.js";
import { EMPTY_HARVEST_BAG, HARVEST_BAG_CAPACITY, harvestBagCount, harvestBagValue } from "../config/harvest.js";

// Soil marks define a continuous painted region. Plants and buildings have
// independent coordinates: neither is attached to a soil dab or grid slot.
export const SAVE_VERSION = 8;
export const roundPosition = value => Math.round(value * 100) / 100;
const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const finitePoint = point => !!point && Number.isFinite(point.x) && Number.isFinite(point.z);
const failure = (state, message) => ({ ok: false, state, message });
export const isSprinkler = item => item?.kind === "sprinkler";

export function newFarm() {
  return {
    version: SAVE_VERSION, coins: 64, harvested: 0, landLevel: FARM.initialLevel,
    inventory: { ...INITIAL_STOCK }, harvestBag: { ...EMPTY_HARVEST_BAG },
    soil: STARTER_PATCHES.map(({ x, z }) => ({ x, z })),
    plants: [], sprinklers: [],
  };
}

export function buyShopItem(state, id) {
  const item = Object.hasOwn(SHOP_ITEMS, id) ? SHOP_ITEMS[id] : null;
  if (!item) return failure(state, "Unknown shop item.");
  if (state.coins < item.cost) return failure(state, "Not enough coins.");
  if (state.inventory[id] > MAX_STOCK - item.quantity) return failure(state, "Storage is full.");
  return {
    ok: true,
    state: { ...state, coins: state.coins - item.cost,
      inventory: { ...state.inventory, [id]: state.inventory[id] + item.quantity } },
    message: item.icon + " Purchased " + item.name + " · +" + item.quantity,
  };
}

export function onLand(state, point, inset = 0) {
  if (!finitePoint(point)) return false;
  const b = landBounds(state.landLevel);
  return point.x >= b.minX + inset && point.x <= b.maxX - inset &&
    point.z >= b.minZ + inset && point.z <= b.maxZ - inset;
}

// Soil membership tests the union of world-space brush discs, never indexes.
export function isPrepared(state, point) {
  return finitePoint(point) && state.soil.some(mark => distance(mark, point) <= FARM.patchRadius + .001);
}
export function findSoilIndex(state, point, maxDistance = FARM.patchRadius) {
  if (!finitePoint(point)) return -1;
  let result = -1, nearest = maxDistance;
  for (let i = 0; i < state.soil.length; i++) {
    const d = distance(state.soil[i], point);
    if (d <= nearest) { nearest = d; result = i; }
  }
  return result;
}
function closest(list, point, radius) {
  if (!finitePoint(point)) return -1;
  let result = -1, nearest = radius;
  for (let i = 0; i < list.length; i++) {
    const d = distance(list[i], point);
    if (d <= nearest) { nearest = d; result = i; }
  }
  return result;
}
export const findPlantIndex = (state, point, radius = FARM.interactRadius) =>
  closest(state.plants, point, radius);
export const findSprinklerIndex = (state, point, radius = FARM.interactRadius) =>
  closest(state.sprinklers, point, radius);
export function nextExpansionCost(state) {
  return state.landLevel >= FARM.maxLevel ? null :
    FARM.expansionCosts[state.landLevel - FARM.initialLevel];
}
export function expandFarm(state) {
  const cost = nextExpansionCost(state);
  if (cost === null) return failure(state, "Farm fully expanded.");
  if (state.coins < cost) return failure(state, "Need ✦ " + cost + " to expand.");
  return {
    ok: true, state: { ...state, coins: state.coins - cost, landLevel: state.landLevel + 1 },
    message: "🌿 More land unlocked",
  };
}
export function createPlot(state, point) {
  if (!finitePoint(point)) return failure(state, "Point at the farm.");
  const stamp = { x: roundPosition(point.x), z: roundPosition(point.z) };
  if (!onLand(state, stamp, FARM.patchRadius)) return failure(state, "Expand land first.");
  if (state.soil.length >= FARM.maxPatches) return failure(state, "Farm is full.");
  if (closest(state.soil, stamp, FARM.brushSpacing - .001) !== -1) return failure(state, "Already prepared.");
  if (state.coins < FARM.patchCost) return failure(state, "Need ✦ " + FARM.patchCost + " for soil.");
  return {
    ok: true,
    state: { ...state, coins: state.coins - FARM.patchCost, soil: [...state.soil, stamp] },
    changedIndices: [state.soil.length], message: "🌱 Soil painted",
  };
}
export function paintSoil(state, from, to) {
  if (!finitePoint(from) || !finitePoint(to)) return failure(state, "Point at the farm.");
  const length = distance(from, to);
  const segments = Math.max(1, Math.ceil(length / (FARM.brushSpacing * .42)));
  let next = state;
  const changedIndices = [];
  let reason = "";
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const result = createPlot(next, {
      x: from.x + (to.x - from.x) * t, z: from.z + (to.z - from.z) * t,
    });
    if (result.ok) {
      next = result.state;
      changedIndices.push(...result.changedIndices);
    } else if (result.message !== "Already prepared.") {
      reason = result.message;
      if (reason === "Farm is full." || reason.startsWith("Need ✦")) break;
    }
  }
  return changedIndices.length ?
    { ok: true, state: next, changedIndices, message: "🌱 Soil painted · " + changedIndices.length } :
    failure(state, reason || "Already prepared.");
}

// A building only needs painted soil under its position, with spatial clearance.
export function placeSprinkler(state, point, now = Date.now()) {
  if (!isPrepared(state, point) || !onLand(state, point)) return failure(state, "Paint soil first.");
  if (state.sprinklers.length >= FARM.maxSprinklers) return failure(state, "Building limit reached.");
  if (closest(state.sprinklers, point, FARM.seedSpacing) !== -1 ||
      closest(state.plants, point, FARM.seedSpacing) !== -1)
    return failure(state, "Space already occupied.");
  if (state.inventory.sprinkler < 1) return failure(state, "Buy a sprinkler in Shop → Buildings.");
  const placed = { x: roundPosition(point.x), z: roundPosition(point.z) };
  const plants = state.plants.slice(), wateredIndices = [];
  for (let i = 0; i < plants.length; i++) {
    if (distance(placed, plants[i]) > SPRINKLER.radius) continue;
    const watered = wateredCrop(plants[i], now);
    if (watered) { plants[i] = watered; wateredIndices.push(i); }
  }
  return {
    ok: true, state: { ...state, plants, sprinklers: [...state.sprinklers, placed],
      inventory: { ...state.inventory, sprinkler: state.inventory.sprinkler - 1 } },
    sprinklerIndex: state.sprinklers.length, wateredIndices,
    message: "💦 Sprinkler placed" + (wateredIndices.length ? " · " + wateredIndices.length + " watered" : ""),
  };
}
export function nearbySprinkler(state, point) {
  return closest(state.sprinklers, point, SPRINKLER.radius);
}
export function coveredBySprinkler(state, point) {
  return nearbySprinkler(state, point) !== -1;
}
function wateredCrop(plant, now) {
  if (!plant) return null;
  const crop = CROPS[plant.cropId];
  if (!crop || plant.watered || now >= plant.readyAt) return null;
  return { ...plant, watered: true,
    readyAt: Math.max(now + 2500, plant.readyAt - crop.growMs * .38) };
}
export function plant(state, point, cropId, now = Date.now()) {
  if (!PLANTABLE_CROPS.includes(cropId)) return failure(state, "Only wheat can be planted.");
  if (!isPrepared(state, point) || !onLand(state, point)) return failure(state, "Paint soil first.");
  if (state.plants.length >= FARM.maxPlants) return failure(state, "Crop limit reached.");
  if (closest(state.plants, point, FARM.seedSpacing - .001) !== -1 ||
      closest(state.sprinklers, point, FARM.seedSpacing - .001) !== -1)
    return failure(state, "Space already occupied.");
  if (state.inventory.wheat < 1) return failure(state, "Buy wheat seed bags in Shop → Seeds.");
  const crop = CROPS[cropId];
  const position = { x: roundPosition(point.x), z: roundPosition(point.z) };
  const planted = { ...position, cropId, plantedAt: now,
    readyAt: now + crop.growMs, watered: false };
  const automatic = coveredBySprinkler(state, position) ? wateredCrop(planted, now) : null;
  return {
    ok: true,
    state: { ...state, plants: [...state.plants, automatic || planted],
      inventory: { ...state.inventory, wheat: state.inventory.wheat - 1 } },
    plantedIndices: [state.plants.length], wateredIndices: automatic ? [state.plants.length] : [],
    message: crop.icon + " " + crop.name + " planted" + (automatic ? " · 💧" : ""),
  };
}

// World-space seed brush samples the path at sub-spacing intervals, including
// endpoints. This works across arbitrary continuous soil, independent of the
// coordinates or order of individual soil stamps. Repeated strokes are free.
export function paintSeeds(state, from, to, cropId = "wheat", now = Date.now()) {
  if (!finitePoint(from) || !finitePoint(to)) return failure(state, "Point at prepared soil.");
  if (!PLANTABLE_CROPS.includes(cropId)) return failure(state, "Only wheat can be planted.");
  if (state.inventory.wheat < 1) return failure(state, "Seed bag empty · Shop → Seeds.");
  const length = distance(from, to);
  const segments = Math.max(1, Math.ceil(length / (FARM.seedSpacing * .36)));
  let next = state;
  const plantedIndices = [], wateredIndices = [];
  for (let i = 0; i <= segments; i++) {
    if (next.inventory.wheat < 1) break;
    const t = i / segments;
    const point = { x: from.x + (to.x - from.x) * t, z: from.z + (to.z - from.z) * t };
    const result = plant(next, point, cropId, now);
    if (!result.ok) continue;
    next = result.state;
    plantedIndices.push(...result.plantedIndices);
    wateredIndices.push(...result.wateredIndices);
  }
  return plantedIndices.length ? {
    ok: true, state: next, plantedIndices, wateredIndices,
    message: "🌾 Painted " + plantedIndices.length + " seed" +
      (plantedIndices.length === 1 ? "" : "s") +
      (next.inventory.wheat === 0 ? " · Bag empty" : ""),
  } : failure(state, next.inventory.wheat === 0 ? "Seed bag empty · Shop → Seeds." : "No empty soil in brush.");
}
function withPlant(state, index, updated) {
  const plants = state.plants.slice();
  plants[index] = updated;
  return { ...state, plants };
}
export function water(state, index, now = Date.now()) {
  const current = state.plants[index];
  if (!Number.isInteger(index) || index < 0 || !current) return failure(state, "Select a growing crop.");
  if (now >= current.readyAt) return failure(state, "Ready to harvest.");
  if (current.watered) return failure(state, "Already watered.");
  const watered = wateredCrop(current, now);
  return { ok: true, state: withPlant(state, index, watered),
    wateredIndices: [index], message: "💧 Watered" };
}
export function harvest(state, index, now = Date.now()) {
  const current = state.plants[index];
  if (!Number.isInteger(index) || index < 0 || !current) return failure(state, "Nothing to harvest.");
  if (now < current.readyAt) return failure(state, "Still growing.");
  if (harvestBagCount(state.harvestBag) >= HARVEST_BAG_CAPACITY)
    return failure(state, "Harvest bag full · Sell before harvesting more.");
  const bag = { ...state.harvestBag, [current.cropId]: state.harvestBag[current.cropId] + 1 };
  return {
    ok: true,
    state: { ...state, plants: state.plants.filter((_, i) => i !== index),
      harvestBag: bag, harvested: state.harvested + 1 },
    message: CROPS[current.cropId].icon + " Collected · Bag " +
      harvestBagCount(bag) + "/" + HARVEST_BAG_CAPACITY +
      (harvestBagCount(bag) === HARVEST_BAG_CAPACITY ? " · Sell your harvest" : ""),
  };
}
export function sellHarvest(state) {
  const count = harvestBagCount(state.harvestBag);
  if (count === 0) return failure(state, "Harvest bag is empty.");
  const earnings = harvestBagValue(state.harvestBag);
  if (!Number.isSafeInteger(state.coins + earnings)) return failure(state, "Unable to sell harvest.");
  return {
    ok: true,
    state: { ...state, coins: state.coins + earnings, harvestBag: { ...EMPTY_HARVEST_BAG } },
    message: "❀ Sold " + count + " crops · +✦ " + earnings,
  };
}
export function growthProgress(plant, now = Date.now()) {
  if (!plant) return 0;
  return Math.max(0, Math.min(1, (now - plant.plantedAt) / Math.max(1, plant.readyAt - plant.plantedAt)));
}
export function growthStage(plant, now = Date.now()) {
  if (!plant) return -1;
  const value = growthProgress(plant, now);
  return value >= 1 ? 3 : value < .25 ? 0 : value < .65 ? 1 : 2;
}
export function secondsRemaining(plant, now = Date.now()) {
  return plant ? Math.max(0, Math.ceil((plant.readyAt - now) / 1000)) : 0;
}

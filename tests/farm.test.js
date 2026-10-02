import test from "node:test";
import assert from "node:assert/strict";
import { CROPS, FARM, PLOT_COUNT, SPRINKLER } from "../src/config/crops.js";
import { newFarm, plant, water, harvest, growthStage, secondsRemaining, expandFarm, nextExpansionCost, isPlotUnlocked, placeSprinkler, neighboringPlots, coveredBySprinkler, isSprinkler, SAVE_VERSION } from "../src/game/farm.js";
import { loadFarm, saveFarm, clearFarm } from "../src/game/storage.js";

test("initial garden has twenty empty plots and starting coins", () => {
  const farm = newFarm();
  assert.equal(farm.plots.length, PLOT_COUNT);
  assert.equal(farm.coins, 64);
  assert.equal(farm.unlockedRows, FARM.initialRows);
  assert.equal(isPlotUnlocked(farm, 9), true);
  assert.equal(isPlotUnlocked(farm, 10), false);
  assert.ok(farm.plots.every(p => p === null));
});
test("planting spends coins without mutating the previous state", () => {
  const original = newFarm();
  const result = plant(original, 0, "carrot", 1000);
  assert.equal(result.ok, true);
  assert.equal(result.state.coins, original.coins - CROPS.carrot.cost);
  assert.equal(result.state.plots[0].readyAt, 1000 + CROPS.carrot.growMs);
  assert.equal(original.plots[0], null);
  assert.equal(plant(result.state, 0, "carrot", 1000).ok, false);
  assert.equal(plant(original, -1, "carrot", 1000).ok, false);
  assert.equal(plant(original, 20, "carrot", 1000).ok, false);
  assert.equal(plant(original, 0, "bad-seed", 1000).ok, false);
});
test("watering reduces remaining growth once and cannot be reapplied", () => {
  const planted = plant(newFarm(), 2, "wheat", 1000).state;
  const watered = water(planted, 2, 2000);
  assert.equal(watered.ok, true);
  assert.ok(watered.state.plots[2].readyAt < planted.plots[2].readyAt);
  assert.equal(water(watered.state, 2, 2000).ok, false);
  assert.equal(planted.plots[2].watered, false);
});
test("harvesting only ripe crops rewards coins and clears the patch", () => {
  const planted = plant(newFarm(), 1, "pumpkin", 1000).state;
  assert.equal(harvest(planted, 1, 2000).ok, false);
  assert.equal(growthStage(planted.plots[1], 1000), 0);
  assert.equal(secondsRemaining(planted.plots[1], 1000 + CROPS.pumpkin.growMs), 0);
  const finished = harvest(planted, 1, 1000 + CROPS.pumpkin.growMs);
  assert.equal(finished.ok, true);
  assert.equal(finished.state.harvested, 1);
  assert.equal(finished.state.coins, 64 - CROPS.pumpkin.cost + CROPS.pumpkin.reward);
  assert.equal(finished.state.plots[1], null);
  assert.equal(growthStage(planted.plots[1], Infinity), 3);
});
test("not enough coins blocks purchases", () => {
  const poor = { ...newFarm(), coins: 0 };
  assert.equal(plant(poor, 1, "carrot", 1000).ok, false);
});
test("save round trip and corrupted saves fail safely", () => {
  const store = new Map();
  const storage = { getItem: k => store.get(k) ?? null, setItem: (k,v) => store.set(k,v), removeItem: k => store.delete(k) };
  const planted = plant(newFarm(), 0, "carrot", 1000).state;
  assert.equal(saveFarm(planted, storage), true);
  assert.deepEqual(loadFarm(storage), planted);
  store.set("farmy-save-v1", '{"version":1,"coins":64,"harvested":0,"plots":[]}');
  assert.deepEqual(loadFarm(storage), newFarm());
  clearFarm(storage);
  assert.deepEqual(loadFarm(storage), newFarm());
});


test("a locked patch cannot be planted, watered, or harvested", () => {
  const farm = newFarm();
  assert.equal(plant(farm, 10, "carrot", 1000).ok, false);
  assert.equal(water(farm, 10, 1000).ok, false);
  assert.equal(harvest(farm, 10, 1000).ok, false);
  assert.equal(farm.coins, 64);
});
test("expanding unlocks full rows with escalating costs and no mutation", () => {
  const original = newFarm();
  assert.equal(nextExpansionCost(original), 85);
  assert.equal(expandFarm(original).ok, false);
  const earned = { ...original, coins: 400 };
  const first = expandFarm(earned);
  assert.equal(first.ok, true);
  assert.equal(first.state.coins, 315);
  assert.equal(first.state.unlockedRows, 3);
  assert.equal(isPlotUnlocked(first.state, 14), true);
  assert.equal(isPlotUnlocked(first.state, 15), false);
  assert.equal(earned.unlockedRows, 2);
  assert.equal(nextExpansionCost(first.state), 180);
  const second = expandFarm(first.state);
  assert.equal(second.ok, true);
  assert.equal(second.state.unlockedRows, 4);
  assert.equal(second.state.coins, 135);
  assert.equal(nextExpansionCost(second.state), null);
  assert.equal(expandFarm(second.state).ok, false);
  assert.equal(plant(second.state, 19, "wheat", 1000).ok, true);
});
test("v1 save migrates with the entire existing garden unlocked", () => {
  const store = new Map();
  const storage = { getItem: k => store.get(k) ?? null, setItem: (k,v) => store.set(k,v), removeItem: k => store.delete(k) };
  const oldPlot = { cropId: "carrot", plantedAt: 1000, readyAt: 26000, watered: false };
  const oldSave = { version: 1, coins: 27, harvested: 8, plots: Array(PLOT_COUNT).fill(null) };
  oldSave.plots[19] = oldPlot;
  store.set("farmy-save-v1", JSON.stringify(oldSave));
  const migrated = loadFarm(storage);
  assert.equal(migrated.version, SAVE_VERSION);
  assert.equal(migrated.unlockedRows, 4);
  assert.equal(migrated.coins, 27);
  assert.equal(migrated.harvested, 8);
  assert.deepEqual(migrated.plots[19], oldPlot);
  assert.equal(isPlotUnlocked(migrated, 19), true);
  assert.equal(nextExpansionCost(migrated), null);
});
test("tampered unlock counts and crops on locked rows are rejected", () => {
  const store = new Map();
  const storage = { getItem: k => store.get(k) ?? null, setItem: (k,v) => store.set(k,v), removeItem: k => store.delete(k) };
  const state = newFarm();
  store.set("farmy-save-v1", JSON.stringify({ ...state, unlockedRows: 5 }));
  assert.deepEqual(loadFarm(storage), newFarm());
  const invalid = { ...state, plots: state.plots.slice() };
  invalid.plots[19] = { cropId: "carrot", plantedAt: 1, readyAt: 5, watered: false };
  store.set("farmy-save-v1", JSON.stringify(invalid));
  assert.deepEqual(loadFarm(storage), newFarm());
});


test("sprinklers use one plot, charge once, and cannot overwrite crops or locked land", () => {
  const poor = newFarm();
  assert.equal(placeSprinkler(poor, 0, 1000).ok, true); // Starting coins support one sprinkler.
  assert.equal(placeSprinkler(newFarm(), 10, 1000).ok, false);
  const occupied = plant(newFarm(), 1, "carrot", 1000).state;
  assert.equal(placeSprinkler(occupied, 1, 2000).ok, false);
  const placed = placeSprinkler(newFarm(), 6, 1000);
  assert.equal(placed.ok, true);
  assert.equal(placed.state.coins, 64 - SPRINKLER.cost);
  assert.deepEqual(placed.state.plots[6], { kind: "sprinkler" });
  assert.equal(isSprinkler(placed.state.plots[6]), true);
  assert.equal(newFarm().plots[6], null);
  assert.equal(placeSprinkler(placed.state, 6, 1000).ok, false);
  assert.equal(water(placed.state, 6, 1200).ok, false);
  assert.equal(harvest(placed.state, 6, 1200).ok, false);
  assert.equal(growthStage(placed.state.plots[6], 1200), -1);
  assert.equal(secondsRemaining(placed.state.plots[6], 1200), 0);
});

test("adjacency includes diagonals without wrapping rows or passing outside grid", () => {
  assert.deepEqual(neighboringPlots(0), [1, 5, 6]);
  assert.deepEqual(neighboringPlots(4), [3, 8, 9]);
  assert.equal(neighboringPlots(4).includes(5), false);
  assert.equal(neighboringPlots(6).includes(12), true);
  assert.deepEqual(neighboringPlots(20), []);
  assert.deepEqual(neighboringPlots(-1), []);
});

test("sprinkler placement immediately waters nearby growing crops once", () => {
  const rich = { ...newFarm(), coins: 200 };
  const cropOne = plant(rich, 1, "wheat", 1000).state;
  const cropTwo = plant(cropOne, 5, "pumpkin", 1000).state;
  const before = cropTwo.plots[1].readyAt;
  const result = placeSprinkler(cropTwo, 6, 2000);
  assert.equal(result.ok, true);
  assert.deepEqual(result.wateredIndices, [1, 5]);
  assert.equal(result.state.plots[1].watered, true);
  assert.equal(result.state.plots[5].watered, true);
  assert.ok(result.state.plots[1].readyAt < before);
  assert.equal(cropTwo.plots[1].watered, false); // No mutation.
  assert.equal(coveredBySprinkler(result.state, 1), true);
  assert.equal(coveredBySprinkler(result.state, 4), false);
  assert.equal(coveredBySprinkler(result.state, 11), false); // Row is locked.
  assert.equal(water(result.state, 1, 2100).ok, false);
});

test("new crops next to a sprinkler are automatically watered, including after harvest", () => {
  const rich = { ...newFarm(), coins: 200 };
  const sprinkler = placeSprinkler(rich, 6, 1000).state;
  const planted = plant(sprinkler, 2, "carrot", 2000);
  assert.equal(planted.ok, true);
  assert.deepEqual(planted.wateredIndices, [2]);
  assert.equal(planted.state.plots[2].watered, true);
  assert.equal(planted.state.plots[2].readyAt, 2000 + CROPS.carrot.growMs * .62);
  const harvested = harvest(planted.state, 2, 50000);
  assert.equal(harvested.ok, true);
  const replanted = plant(harvested.state, 2, "wheat", 51000);
  assert.deepEqual(replanted.wateredIndices, [2]);
  assert.equal(replanted.state.plots[2].watered, true);
  assert.equal(sprinkler.plots[2], null);
  const farAway = plant(sprinkler, 4, "wheat", 2000);
  assert.deepEqual(farAway.wateredIndices, []);
  assert.equal(farAway.state.plots[4].watered, false);
});

test("watering a ripe crop does not change its timer when a sprinkler is placed", () => {
  const rich = { ...newFarm(), coins: 200 };
  const ripe = plant(rich, 1, "carrot", 1000).state;
  const placed = placeSprinkler(ripe, 6, 50000);
  assert.deepEqual(placed.wateredIndices, []);
  assert.equal(placed.state.plots[1].readyAt, ripe.plots[1].readyAt);
  assert.equal(placed.state.plots[1].watered, false);
});

test("sprinklers round-trip through storage, and old v2 farms migrate", () => {
  const store = new Map();
  const storage = { getItem: k => store.get(k) ?? null, setItem: (k,v) => store.set(k,v), removeItem: k => store.delete(k) };
  const rich = { ...newFarm(), coins: 200 };
  const placed = placeSprinkler(plant(rich, 1, "wheat", 1000).state, 6, 2000).state;
  assert.equal(saveFarm(placed, storage), true);
  assert.deepEqual(loadFarm(storage), placed);
  const v2 = { ...newFarm(), version: 2, unlockedRows: 3, coins: 45 };
  v2.plots = Array(PLOT_COUNT).fill(null);
  v2.plots[14] = { cropId: "wheat", plantedAt: 1000, readyAt: 43000, watered: false };
  store.set("farmy-save-v1", JSON.stringify(v2));
  const migrated = loadFarm(storage);
  assert.equal(migrated.version, SAVE_VERSION);
  assert.equal(migrated.unlockedRows, 3);
  assert.equal(migrated.coins, 45);
  assert.deepEqual(migrated.plots[14], v2.plots[14]);
  assert.equal(migrated.plots[6], null);
  // A malformed sprinkler or structure on locked land is safely rejected.
  store.set("farmy-save-v1", JSON.stringify({ ...placed, plots: placed.plots.map((p,i) => i === 6 ? {kind:"sprinkler", extra: true} : p) }));
  assert.deepEqual(loadFarm(storage), newFarm());
  const locked = { ...newFarm(), plots: Array(PLOT_COUNT).fill(null) };
  locked.plots[15] = { kind: "sprinkler" };
  store.set("farmy-save-v1", JSON.stringify(locked));
  assert.deepEqual(loadFarm(storage), newFarm());
});

import test from "node:test";
import assert from "node:assert/strict";
import { CROPS, FARM, PLOT_COUNT } from "../src/config/crops.js";
import { newFarm, plant, water, harvest, growthStage, secondsRemaining, expandFarm, nextExpansionCost, isPlotUnlocked } from "../src/game/farm.js";
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
  assert.equal(migrated.version, 2);
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

import test from "node:test";
import assert from "node:assert/strict";
import { CROPS, FARM, PLOT_COST, PLOT_COUNT, SPRINKLER, STARTER_PLOTS } from "../src/config/crops.js";
import {
  SAVE_VERSION, newFarm, isPlotUnlocked, isFarmPlot, createPlot, expandFarm,
  nextExpansionCost, plant, water, harvest, growthStage, growthProgress,
  secondsRemaining, placeSprinkler, neighboringPlots, coveredBySprinkler, isSprinkler,
} from "../src/game/farm.js";
import { loadFarm, saveFarm, clearFarm, SAVE_KEY } from "../src/game/storage.js";

function memoryStorage() {
  const entries = new Map();
  return {
    getItem: key => entries.get(key) ?? null,
    setItem: (key, value) => entries.set(key, value),
    removeItem: key => entries.delete(key),
  };
}
function richFarm(coins = 400) { return { ...newFarm(), coins }; }

test("new farm owns two rows but starts with only four chosen soil plots", () => {
  const farm = newFarm();
  assert.equal(farm.version, SAVE_VERSION);
  assert.equal(farm.coins, 64);
  assert.equal(farm.harvested, 0);
  assert.equal(farm.plots.length, PLOT_COUNT);
  assert.equal(farm.tilled.length, PLOT_COUNT);
  assert.equal(farm.unlockedRows, FARM.initialRows);
  assert.deepEqual(farm.tilled.flatMap((hasSoil, index) => hasSoil ? [index] : []), STARTER_PLOTS);
  assert.equal(isPlotUnlocked(farm, 9), true);
  assert.equal(isFarmPlot(farm, 9), false);
  assert.equal(isPlotUnlocked(farm, 10), false);
  assert.equal(isFarmPlot(farm, 10), false);
  assert.ok(farm.plots.every(plot => plot === null));
});

test("farm plots can be prepared anywhere on owned grass, spending coins once", () => {
  const old = newFarm();
  assert.equal(createPlot(old, 10).ok, false); // Land must be owned first.
  assert.equal(createPlot(old, -1).ok, false);
  assert.equal(createPlot(old, 20).ok, false);
  assert.equal(createPlot(old, 0).ok, false); // Existing starter plot.
  const result = createPlot(old, 9);
  assert.equal(result.ok, true);
  assert.equal(result.state.coins, old.coins - PLOT_COST);
  assert.equal(isFarmPlot(result.state, 9), true);
  assert.equal(old.tilled[9], false);
  assert.equal(createPlot(result.state, 9).ok, false);
  assert.equal(createPlot({ ...old, coins: PLOT_COST - 1 }, 9).ok, false);
  assert.equal(plant(old, 9, "wheat", 1000).ok, false);
  assert.equal(plant(result.state, 9, "wheat", 1000).ok, true);
});

test("expanding the underlying land never creates soil automatically", () => {
  const original = richFarm();
  assert.equal(nextExpansionCost(original), 85);
  const first = expandFarm(original);
  assert.equal(first.ok, true);
  assert.equal(first.state.coins, original.coins - 85);
  assert.equal(first.state.unlockedRows, 3);
  assert.equal(isPlotUnlocked(first.state, 10), true);
  assert.equal(isPlotUnlocked(first.state, 14), true);
  assert.equal(isFarmPlot(first.state, 10), false);
  assert.equal(isFarmPlot(first.state, 14), false);
  assert.equal(plant(first.state, 14, "wheat", 1000).ok, false);
  assert.deepEqual(first.state.tilled, original.tilled);
  assert.equal(original.unlockedRows, 2);

  const chosen = createPlot(first.state, 14);
  assert.equal(chosen.ok, true);
  assert.equal(isFarmPlot(chosen.state, 14), true);
  assert.equal(isFarmPlot(chosen.state, 10), false);
  assert.equal(plant(chosen.state, 14, "wheat", 1000).ok, true);
  assert.equal(nextExpansionCost(chosen.state), 180);

  const second = expandFarm(chosen.state);
  assert.equal(second.ok, true);
  assert.equal(second.state.unlockedRows, 4);
  assert.equal(isPlotUnlocked(second.state, 19), true);
  assert.equal(isFarmPlot(second.state, 19), false);
  assert.equal(createPlot(second.state, 19).ok, true);
  assert.equal(nextExpansionCost(second.state), null);
  assert.equal(expandFarm(second.state).ok, false);
  assert.equal(expandFarm(newFarm()).ok, false); // Unaffordable on a fresh farm.
});

test("wheat-only planting requires soil and retains non-mutating crop growth", () => {
  const farm = newFarm();
  for (const discontinued of ["carrot", "pumpkin", "bad-seed"]) {
    const result = plant(farm, 0, discontinued, 1000);
    assert.equal(result.ok, false);
    assert.equal(result.state, farm);
  }
  const planted = plant(farm, 1, "wheat", 1000);
  assert.equal(planted.ok, true);
  assert.equal(planted.state.coins, farm.coins - CROPS.wheat.cost);
  assert.equal(planted.state.plots[1].readyAt, 1000 + CROPS.wheat.growMs);
  assert.equal(farm.plots[1], null);
  assert.equal(plant(planted.state, 1, "wheat", 1000).ok, false);
  assert.equal(plant({ ...farm, coins: 0 }, 1, "wheat", 1000).ok, false);
  assert.equal(plant(farm, 2, "wheat", 1000).ok, false); // Owned, but not tilled.
  assert.equal(growthStage(planted.state.plots[1], 1000), 0);
  assert.equal(growthStage(planted.state.plots[1], Infinity), 3);
  assert.equal(growthProgress(null, 1000), 0);
  assert.equal(secondsRemaining(planted.state.plots[1], 1000 + CROPS.wheat.growMs), 0);
});

test("manual watering is a one-time boost, and ripe crops harvest into reusable soil", () => {
  const planted = plant(newFarm(), 0, "wheat", 1000).state;
  assert.equal(water(planted, 0, 90000).ok, false);
  const result = water(planted, 0, 2000);
  assert.equal(result.ok, true);
  assert.deepEqual(result.wateredIndices, [0]);
  assert.equal(result.state.plots[0].watered, true);
  assert.ok(result.state.plots[0].readyAt < planted.plots[0].readyAt);
  assert.equal(planted.plots[0].watered, false);
  assert.equal(water(result.state, 0, 3000).ok, false);
  assert.equal(harvest(result.state, 0, 3000).ok, false);
  const harvested = harvest(result.state, 0, 90000);
  assert.equal(harvested.ok, true);
  assert.equal(harvested.state.coins, 64 - CROPS.wheat.cost + CROPS.wheat.reward);
  assert.equal(harvested.state.harvested, 1);
  assert.equal(harvested.state.plots[0], null);
  assert.equal(isFarmPlot(harvested.state, 0), true);
  assert.equal(plant(harvested.state, 0, "wheat", 91000).ok, true);
});

test("a sprinkler occupies prepared soil and never creates plots or waters bare grass", () => {
  const fresh = newFarm();
  assert.equal(placeSprinkler(fresh, 2, 1000).ok, false); // Owned grass, not soil.
  assert.equal(placeSprinkler(fresh, 10, 1000).ok, false); // Land is locked.
  const planted = plant(fresh, 1, "wheat", 1000).state;
  assert.equal(placeSprinkler(planted, 1, 2000).ok, false);
  const placed = placeSprinkler(fresh, 6, 1000);
  assert.equal(placed.ok, true);
  assert.equal(placed.state.coins, 64 - SPRINKLER.cost);
  assert.deepEqual(placed.state.plots[6], { kind: "sprinkler" });
  assert.equal(isSprinkler(placed.state.plots[6]), true);
  assert.deepEqual(placed.wateredIndices, []);
  assert.equal(fresh.plots[6], null);
  assert.equal(placeSprinkler(placed.state, 6).ok, false);
  assert.equal(createPlot(placed.state, 6).ok, false);
  assert.equal(water(placed.state, 6).ok, false);
  assert.equal(harvest(placed.state, 6).ok, false);
  assert.equal(growthStage(placed.state.plots[6], 1000), -1);
  assert.equal(secondsRemaining(placed.state.plots[6], 1000), 0);
});

test("sprinkler covers up to eight real neighboring cells without row wrapping", () => {
  assert.deepEqual(neighboringPlots(0), [1, 5, 6]);
  assert.deepEqual(neighboringPlots(4), [3, 8, 9]);
  assert.equal(neighboringPlots(4).includes(5), false);
  assert.equal(neighboringPlots(6).includes(12), true);
  assert.deepEqual(neighboringPlots(-1), []);
  assert.deepEqual(neighboringPlots(20), []);
  const sprinkler = placeSprinkler(richFarm(), 6, 1000).state;
  assert.equal(coveredBySprinkler(sprinkler, 0), true);
  assert.equal(coveredBySprinkler(sprinkler, 2), true); // Grass can be in range, but not planted until tilled.
  assert.equal(coveredBySprinkler(sprinkler, 4), false);
  assert.equal(coveredBySprinkler(sprinkler, 11), false); // Still unowned.
});

test("placing a sprinkler waters nearby crops; tilling beside it enables auto-watered seeds", () => {
  const first = plant(richFarm(), 1, "wheat", 1000).state;
  const second = plant(first, 5, "wheat", 1000).state;
  const originalReadyAt = second.plots[1].readyAt;
  const placed = placeSprinkler(second, 6, 2000);
  assert.equal(placed.ok, true);
  assert.deepEqual(placed.wateredIndices, [1, 5]);
  assert.ok(placed.state.plots[1].readyAt < originalReadyAt);
  assert.equal(placed.state.plots[1].watered, true);
  assert.equal(second.plots[1].watered, false);
  assert.equal(water(placed.state, 1, 3000).ok, false);

  assert.equal(plant(placed.state, 2, "wheat", 2500).ok, false);
  const tilled = createPlot(placed.state, 2);
  assert.equal(tilled.ok, true);
  const planted = plant(tilled.state, 2, "wheat", 3000);
  assert.equal(planted.ok, true);
  assert.deepEqual(planted.wateredIndices, [2]);
  assert.equal(planted.state.plots[2].watered, true);
  assert.equal(planted.state.plots[2].readyAt, 3000 + CROPS.wheat.growMs * .62);
  const harvested = harvest(planted.state, 2, 60000);
  const replanted = plant(harvested.state, 2, "wheat", 61000);
  assert.deepEqual(replanted.wateredIndices, [2]);

  // A second sprinkler must not re-water crops that were already watered.
  const overlapped = placeSprinkler(placed.state, 0, 3500);
  assert.equal(overlapped.ok, true);
  assert.deepEqual(overlapped.wateredIndices, []);
});

test("sprinklers do not water already ripe crops", () => {
  const ripe = plant(richFarm(), 1, "wheat", 1000).state;
  const placed = placeSprinkler(ripe, 6, 90000);
  assert.deepEqual(placed.wateredIndices, []);
  assert.equal(placed.state.plots[1].readyAt, ripe.plots[1].readyAt);
  assert.equal(placed.state.plots[1].watered, false);
});

test("save round trip preserves owned land, chosen plots, crops and sprinklers", () => {
  const storage = memoryStorage();
  const original = richFarm();
  const expanded = expandFarm(original).state;
  const till = createPlot(expanded, 13).state;
  const planted = plant(till, 13, "wheat", 1000).state;
  const sprinkler = placeSprinkler(planted, 6, 1200).state;
  assert.equal(saveFarm(sprinkler, storage), true);
  assert.deepEqual(loadFarm(storage), sprinkler);
  clearFarm(storage);
  assert.deepEqual(loadFarm(storage), newFarm());
});

test("v1, v2, and v3 saves migrate with all previously owned cells tilled", () => {
  const storage = memoryStorage();
  const oldCrop = { cropId: "pumpkin", plantedAt: 1000, readyAt: 66000, watered: false };
  const v1 = { version: 1, coins: 27, harvested: 8, plots: Array(PLOT_COUNT).fill(null) };
  v1.plots[19] = oldCrop;
  storage.setItem(SAVE_KEY, JSON.stringify(v1));
  let migrated = loadFarm(storage);
  assert.equal(migrated.version, SAVE_VERSION);
  assert.equal(migrated.unlockedRows, 4);
  assert.equal(migrated.tilled.every(Boolean), true);
  assert.deepEqual(migrated.plots[19], oldCrop);
  assert.equal(migrated.coins, 27);
  assert.equal(migrated.harvested, 8);
  assert.equal(harvest(migrated, 19, 90000).ok, true);

  const v2 = { version: 2, coins: 45, harvested: 2, unlockedRows: 3, plots: Array(PLOT_COUNT).fill(null) };
  v2.plots[14] = oldCrop;
  storage.setItem(SAVE_KEY, JSON.stringify(v2));
  migrated = loadFarm(storage);
  assert.equal(migrated.unlockedRows, 3);
  assert.ok(migrated.tilled.slice(0, 15).every(Boolean));
  assert.ok(migrated.tilled.slice(15).every(prepared => !prepared));
  assert.deepEqual(migrated.plots[14], oldCrop);
  assert.equal(plant(migrated, 0, "wheat", 2000).ok, true);

  const v3 = { version: 3, coins: 20, harvested: 3, unlockedRows: 2, plots: Array(PLOT_COUNT).fill(null) };
  v3.plots[9] = { kind: "sprinkler" };
  storage.setItem(SAVE_KEY, JSON.stringify(v3));
  migrated = loadFarm(storage);
  assert.equal(migrated.version, SAVE_VERSION);
  assert.equal(isFarmPlot(migrated, 9), true);
  assert.deepEqual(migrated.plots[9], { kind: "sprinkler" });
});

test("invalid saves cannot place crops on grass, till unowned land or inject structures", () => {
  const storage = memoryStorage();
  const fresh = newFarm();
  const invalidStates = [
    { ...fresh, tilled: [] },
    { ...fresh, tilled: Array(PLOT_COUNT).fill(true) },
    { ...fresh, unlockedRows: 5 },
    { ...fresh, coins: -1 },
    { ...fresh, tilled: [...fresh.tilled.slice(0, 2), "yes", ...fresh.tilled.slice(3)] },
    { ...fresh, plots: fresh.plots.map((p, index) => index === 2 ? { cropId: "wheat", plantedAt: 1000, readyAt: 43000, watered: false } : p) },
    { ...fresh, plots: fresh.plots.map((p, index) => index === 6 ? { kind: "sprinkler", extra: true } : p) },
  ];
  for (const invalid of invalidStates) {
    storage.setItem(SAVE_KEY, JSON.stringify(invalid));
    assert.deepEqual(loadFarm(storage), newFarm());
  }
  storage.setItem(SAVE_KEY, '{"version":1,"plots":[]}');
  assert.deepEqual(loadFarm(storage), newFarm());
  clearFarm(storage);
  assert.deepEqual(loadFarm(storage), newFarm());
});

import test from "node:test";
import assert from "node:assert/strict";
import { CROPS } from "../src/config/crops.js";
import { EMPTY_HARVEST_BAG, HARVEST_BAG_CAPACITY,
  harvestBagCount, harvestBagValue, validHarvestBag } from "../src/config/harvest.js";
import { SAVE_VERSION, newFarm, plant, harvest, sellHarvest } from "../src/game/farm.js";
import { SAVE_KEY, loadFarm, saveFarm } from "../src/game/storage.js";

function memoryStorage() {
  const values = new Map();
  return { getItem: k => values.get(k) ?? null, setItem: (k, v) => values.set(k, v) };
}
function ripeCrop(cropId) {
  return { cropId, plantedAt: 1000, readyAt: 2000, watered: false };
}
function stockedFarm(crops) {
  const farm = newFarm();
  return {
    ...farm,
    inventory: { wheat: 20, sprinkler: 1 },
    patches: farm.patches.map((patch, index) => ({
      ...patch, content: crops[index] ? ripeCrop(crops[index]) : null,
    })),
  };
}

test("harvesting a ripe crop fills the bag without immediately awarding coins", () => {
  const original = stockedFarm(["wheat"]);
  const result = harvest(original, 0, 3000);
  assert.equal(result.ok, true);
  assert.equal(result.state.coins, original.coins);
  assert.equal(result.state.harvested, original.harvested + 1);
  assert.deepEqual(result.state.harvestBag, { carrot: 0, wheat: 1, pumpkin: 0 });
  assert.equal(result.state.patches[0].content, null);
  assert.equal(original.patches[0].content.cropId, "wheat");
  assert.equal(original.harvestBag.wheat, 0);
  assert.equal(harvestBagCount(result.state.harvestBag), 1);
  assert.equal(harvestBagValue(result.state.harvestBag), CROPS.wheat.reward);
  assert.equal(harvest(result.state, 0, 3001).ok, false);
});

test("mixed historic crops retain their exact rewards until the entire bag is sold", () => {
  let state = stockedFarm(["wheat", "carrot", "pumpkin"]);
  for (let index = 0; index < 3; index++) {
    const result = harvest(state, index, 3000);
    assert.equal(result.ok, true);
    state = result.state;
  }
  const payout = CROPS.wheat.reward + CROPS.carrot.reward + CROPS.pumpkin.reward;
  assert.equal(state.coins, 64);
  assert.equal(state.harvested, 3);
  assert.deepEqual(state.harvestBag, { carrot: 1, wheat: 1, pumpkin: 1 });
  assert.equal(harvestBagCount(state.harvestBag), 3);
  assert.equal(harvestBagValue(state.harvestBag), payout);
  const sold = sellHarvest(state);
  assert.equal(sold.ok, true);
  assert.equal(sold.state.coins, 64 + payout);
  assert.equal(sold.state.harvested, 3);
  assert.deepEqual(sold.state.harvestBag, EMPTY_HARVEST_BAG);
  assert.equal(harvestBagCount(state.harvestBag), 3); // Immutable.
  assert.equal(sellHarvest(sold.state).ok, false); // Never pay twice.
  assert.equal(sellHarvest(sold.state).state, sold.state);
});

test("ten crops fill the bag; the eleventh ripe crop cannot be harvested until sale", () => {
  let state = { ...newFarm(), inventory: { wheat: 11, sprinkler: 0 } };
  for (let index = 0; index < HARVEST_BAG_CAPACITY; index++) {
    const now = 1000 + index * 100000;
    state = plant(state, 0, "wheat", now).state;
    const harvested = harvest(state, 0, now + CROPS.wheat.growMs + 1);
    assert.equal(harvested.ok, true);
    state = harvested.state;
  }
  assert.equal(state.harvestBag.wheat, HARVEST_BAG_CAPACITY);
  assert.equal(state.harvested, HARVEST_BAG_CAPACITY);
  const lastTime = 1000 + HARVEST_BAG_CAPACITY * 100000;
  state = plant(state, 0, "wheat", lastTime).state;
  const blocked = harvest(state, 0, lastTime + CROPS.wheat.growMs + 1);
  assert.equal(blocked.ok, false);
  assert.match(blocked.message, /bag full/i);
  assert.equal(blocked.state, state);
  assert.equal(state.patches[0].content.cropId, "wheat");
  const sold = sellHarvest(state);
  assert.equal(sold.ok, true);
  assert.equal(sold.state.coins, 64 + HARVEST_BAG_CAPACITY * CROPS.wheat.reward);
  assert.equal(sold.state.inventory.wheat, 0);
  const continued = harvest(sold.state, 0, lastTime + CROPS.wheat.growMs + 1);
  assert.equal(continued.ok, true);
  assert.equal(continued.state.harvestBag.wheat, 1);
  assert.equal(continued.state.coins, sold.state.coins);
  assert.equal(continued.state.harvested, HARVEST_BAG_CAPACITY + 1);
});

test("invalid harvests or empty bag sales do not mutate state", () => {
  const farm = newFarm();
  assert.deepEqual(farm.harvestBag, EMPTY_HARVEST_BAG);
  assert.equal(sellHarvest(farm).ok, false);
  assert.equal(harvest(farm, 0).ok, false);
  const growing = {
    ...farm,
    patches: farm.patches.map((p, i) => i === 0 ?
      { ...p, content: { cropId: "wheat", plantedAt: 1000, readyAt: 9000, watered: false } } : p),
  };
  assert.equal(harvest(growing, 0, 2000).ok, false);
  assert.equal(growing.harvestBag.wheat, 0);
  const overflowing = { ...farm, coins: Number.MAX_SAFE_INTEGER,
    harvestBag: { ...EMPTY_HARVEST_BAG, pumpkin: 1 } };
  assert.equal(sellHarvest(overflowing).ok, false);
  assert.equal(overflowing.harvestBag.pumpkin, 1);
});

test("bag counts are validated and persist across reloads, including a full bag", () => {
  const store = memoryStorage();
  const saved = { ...newFarm(), harvestBag: { carrot: 2, wheat: 7, pumpkin: 1 }, harvested: 20 };
  assert.equal(harvestBagCount(saved.harvestBag), HARVEST_BAG_CAPACITY);
  assert.equal(validHarvestBag(saved.harvestBag), true);
  assert.equal(saveFarm(saved, store), true);
  assert.deepEqual(loadFarm(store), saved);
  for (const invalid of [
    null, [], {}, { carrot: 0, wheat: 1 }, { carrot: 0, wheat: 0, pumpkin: 0, extra: 1 },
    { carrot: -1, wheat: 0, pumpkin: 0 }, { carrot: .5, wheat: 0, pumpkin: 0 },
    { carrot: 1, wheat: 10, pumpkin: 0 }, { carrot: NaN, wheat: 0, pumpkin: 0 },
  ]) {
    assert.equal(validHarvestBag(invalid), false);
    store.setItem(SAVE_KEY, JSON.stringify({ ...saved, harvestBag: invalid }));
    assert.deepEqual(loadFarm(store), newFarm());
  }
});

test("v6 inventory and previously earned coins migrate intact, with an empty new bag", () => {
  const store = memoryStorage();
  const previous = { ...newFarm(), version: 6,
    coins: 418, harvested: 32, inventory: { wheat: 7, sprinkler: 2 } };
  delete previous.harvestBag;
  previous.patches[0] = { ...previous.patches[0], content: ripeCrop("pumpkin") };
  store.setItem(SAVE_KEY, JSON.stringify(previous));
  const migrated = loadFarm(store);
  assert.equal(migrated.version, SAVE_VERSION);
  assert.equal(migrated.coins, 418);
  assert.equal(migrated.harvested, 32);
  assert.deepEqual(migrated.inventory, previous.inventory);
  assert.deepEqual(migrated.harvestBag, EMPTY_HARVEST_BAG);
  assert.deepEqual(migrated.patches, previous.patches);
  const harvested = harvest(migrated, 0, 3000);
  assert.equal(harvested.ok, true);
  assert.equal(harvested.state.coins, 418);
  assert.equal(harvested.state.harvestBag.pumpkin, 1);
});

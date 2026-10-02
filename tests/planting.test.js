import test from "node:test";
import assert from "node:assert/strict";
import { CROPS, FARM } from "../src/config/crops.js";
import { newFarm, buyShopItem, paintSoil, paintSeeds, plant, harvest,
  placeSprinkler } from "../src/game/farm.js";
import { SAVE_KEY, loadFarm, saveFarm } from "../src/game/storage.js";

const point = (x, z) => ({ x, z });
const bag = (coins = 300) => buyShopItem({ ...newFarm(), coins }, "wheat").state;
const storage = () => {
  const data = new Map();
  return { getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value) };
};

test("one uninterrupted drag plants every touched empty soil patch, not only endpoints", () => {
  const bought = bag();
  const prepared = paintSoil(bought, point(-5.2, -.7), point(-1.35, -.7));
  assert.equal(prepared.ok, true);
  const expected = prepared.changedIndices;
  assert.ok(expected.length >= 4);
  const initialCoins = prepared.state.coins;
  const result = paintSeeds(prepared.state, point(-5.2, -.7), point(-1.35, -.7), "wheat", 1000);
  assert.equal(result.ok, true);
  assert.deepEqual(result.plantedIndices, expected);
  assert.equal(result.state.inventory.wheat, 10 - expected.length);
  assert.equal(result.state.coins, initialCoins); // Paid for the bag at the shop.
  for (const index of expected) {
    assert.equal(result.state.patches[index].content.cropId, "wheat");
    assert.equal(result.state.patches[index].content.readyAt, 1000 + CROPS.wheat.growMs);
  }
  assert.equal(prepared.state.patches[expected[0]].content, null); // Immutable state.
});

test("repeated or overlapping strokes never spend a second seed on existing crops", () => {
  const initial = bag();
  const first = paintSeeds(initial, point(-8.6, -3.5), point(-6.4, -3.5), "wheat", 1000);
  assert.deepEqual(first.plantedIndices, [0, 1]);
  assert.equal(first.state.inventory.wheat, 8);
  const repeat = paintSeeds(first.state, point(-8.6, -3.5), point(-6.4, -3.5), "wheat", 1500);
  assert.equal(repeat.ok, false);
  assert.equal(repeat.state, first.state);
  const second = paintSeeds(first.state, point(-8.6, -1.3), point(-6.4, -1.3), "wheat", 2000);
  assert.deepEqual(second.plantedIndices, [2, 3]);
  assert.equal(second.state.inventory.wheat, 6);
  assert.equal(second.state.patches[0].content.plantedAt, 1000);
});

test("stroke processes candidates in drawing order when only one seed is left", () => {
  const original = { ...newFarm(), inventory: { wheat: 1, sprinkler: 0 } };
  const backwards = paintSeeds(original, point(-6.4, -3.5), point(-8.6, -3.5), "wheat", 1000);
  assert.equal(backwards.ok, true);
  assert.deepEqual(backwards.plantedIndices, [1]);
  assert.equal(backwards.state.inventory.wheat, 0);
  assert.match(backwards.message, /Bag empty/);
  assert.equal(backwards.state.patches[0].content, null);
  const exhausted = paintSeeds(backwards.state, point(-8.6, -3.5), point(-8.6, -3.5), "wheat", 2000);
  assert.equal(exhausted.ok, false);
  assert.equal(exhausted.state, backwards.state);
  assert.equal(exhausted.state.coins, original.coins);
});

test("a full bag contains ten finite seed charges across multiple painted strokes", () => {
  let state = bag();
  const extra = paintSoil(state, point(-5.15, -.65), point(-.05, -.65));
  assert.equal(extra.ok, true);
  state = extra.state;
  const first = paintSeeds(state, point(-8.6, -3.5), point(-6.4, -3.5), "wheat", 1000);
  assert.deepEqual(first.plantedIndices, [0, 1]);
  state = first.state;
  assert.equal(state.inventory.wheat, 8);
  const second = paintSeeds(state, point(-8.6, -1.3), point(-6.4, -1.3), "wheat", 2000);
  assert.deepEqual(second.plantedIndices, [2, 3]);
  state = second.state;
  assert.equal(state.inventory.wheat, 6);
  const third = paintSeeds(state, point(-5.15, -.65), point(-.05, -.65), "wheat", 3000);
  assert.equal(third.ok, true);
  assert.equal(third.plantedIndices.length, 6);
  assert.equal(third.state.inventory.wheat, 0);
  assert.equal(paintSeeds(third.state, point(-8.6, -3.5), point(-8.6, -3.5)).ok, false);
});

test("sowing never creates soil or overwrites sprinklers, growing crops or legacy crops", () => {
  const initial = bag(400);
  assert.equal(paintSeeds(initial, point(-3, 0), point(-1, 0)).ok, false);
  assert.equal(paintSeeds(initial, null, point(-8.6, -3.5)).ok, false);
  assert.equal(paintSeeds(initial, point(NaN, 0), point(-8.6, -3.5)).ok, false);
  assert.equal(paintSeeds(initial, point(-8.6, -3.5), point(-8.6, -3.5), "pumpkin").ok, false);
  const boughtSprinkler = buyShopItem(initial, "sprinkler").state;
  const placed = placeSprinkler(boughtSprinkler, 0, 1000).state;
  const planted = plant(placed, 1, "wheat", 1000).state;
  const legacy = {
    ...planted,
    patches: planted.patches.map((patch, index) => index === 2 ? {
      ...patch, content: { cropId: "carrot", plantedAt: 1000, readyAt: 26000, watered: false },
    } : patch),
  };
  const seedCount = legacy.inventory.wheat;
  const result = paintSeeds(legacy, point(-8.6, -3.5), point(-6.4, -1.3), "wheat", 2000);
  assert.equal(result.ok, true);
  assert.deepEqual(result.plantedIndices, [3]);
  assert.equal(result.state.inventory.wheat, seedCount - 1);
  assert.equal(result.state.patches[0].content.kind, "sprinkler");
  assert.equal(result.state.patches[1].content.plantedAt, 1000);
  assert.equal(result.state.patches[2].content.cropId, "carrot");
  assert.equal(result.state.patches.length, legacy.patches.length);
});

test("seeds painted beside sprinklers receive the usual one-time automatic watering", () => {
  let state = bag(400);
  state = buyShopItem(state, "sprinkler").state;
  state = placeSprinkler(state, 0, 1000).state;
  const result = paintSeeds(state, point(-6.4, -3.5), point(-6.4, -1.3), "wheat", 2000);
  assert.deepEqual(result.plantedIndices, [1, 3]);
  assert.deepEqual(result.wateredIndices, [1, 3]);
  for (const index of result.plantedIndices) {
    assert.equal(result.state.patches[index].content.watered, true);
    assert.equal(result.state.patches[index].content.readyAt, 2000 + CROPS.wheat.growMs * .62);
  }
  assert.equal(result.state.inventory.wheat, state.inventory.wheat - 2);
});

test("painted crops and remaining bag charges persist after saving and loading", () => {
  const store = storage();
  const initial = bag();
  const painted = paintSeeds(initial, point(-8.6, -3.5), point(-6.4, -3.5), "wheat", 1000);
  assert.ok(saveFarm(painted.state, store));
  assert.deepEqual(loadFarm(store), painted.state);
  const restored = loadFarm(store);
  assert.equal(restored.inventory.wheat, 8);
  const remaining = paintSeeds(restored, point(-8.6, -1.3), point(-6.4, -1.3), "wheat", 2000);
  assert.equal(remaining.state.inventory.wheat, 6);
  const harvested = harvest(remaining.state, 0, 100000);
  assert.equal(harvested.ok, true);
  assert.equal(harvested.state.inventory.wheat, 6);
  assert.equal(harvested.state.patches[0].content, null);
  assert.equal(FARM.seedBrushRadius <= FARM.patchRadius, true);
});

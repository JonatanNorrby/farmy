import test from "node:test";
import assert from "node:assert/strict";
import { CROPS, FARM, LEGACY_PLOT_COUNT, SPRINKLER, legacyPlotPosition, landBounds } from "../src/config/crops.js";
import { SAVE_VERSION, newFarm, onLand, findPatchIndex, createPlot, paintSoil,
  expandFarm, nextExpansionCost, placeSprinkler, coveredBySprinkler, nearbySprinkler,
  plant, water, harvest, isSprinkler, growthStage, secondsRemaining } from "../src/game/farm.js";
import { SAVE_KEY, loadFarm, saveFarm, clearFarm } from "../src/game/storage.js";

function storage() {
  const values = new Map();
  return { getItem: k => values.get(k) ?? null, setItem: (k, v) => values.set(k, v), removeItem: k => values.delete(k) };
}
const rich = (coins = 500) => ({ ...newFarm(), coins });
const point = (x, z) => ({ x, z });

test("new farms use four positioned patches and a continuous owned ground", () => {
  const farm = newFarm();
  assert.equal(farm.version, 5);
  assert.equal(farm.coins, 64);
  assert.equal(farm.landLevel, 2);
  assert.equal(farm.patches.length, 4);
  assert.ok(farm.patches.every(p => p.content === null && typeof p.x === "number" && typeof p.z === "number"));
  assert.equal(onLand(farm, point(-3, -1)), true);
  assert.equal(onLand(farm, point(-3, 3)), false);
  assert.equal(findPatchIndex(farm, farm.patches[0]), 0);
  assert.equal(findPatchIndex(farm, point(99, 99)), -1);
  assert.equal(onLand(farm, point(NaN, 0)), false);
});

test("soil can be painted at arbitrary coordinates, and repeat dabs are free", () => {
  const farm = newFarm(), at = point(-3.37, -1.93);
  const result = createPlot(farm, at);
  assert.equal(result.ok, true);
  assert.deepEqual(result.changedIndices, [4]);
  assert.equal(result.state.patches[4].x, -3.37);
  assert.equal(result.state.patches[4].z, -1.93);
  assert.equal(result.state.coins, 64 - FARM.patchCost);
  assert.equal(farm.patches.length, 4);
  assert.equal(createPlot(result.state, at).ok, false);
  assert.equal(createPlot(result.state, point(at.x + .4, at.z)).ok, false);
  assert.equal(createPlot(farm, point(50, 50)).ok, false);
  assert.equal(createPlot({ ...farm, coins: 0 }, at).ok, false);
  assert.equal(plant(farm, 4, "wheat", 1000).ok, false);
  assert.equal(plant(result.state, 4, "wheat", 1000).ok, true);
});

test("painting a fast drag fills the entire line with overlapping soil marks", () => {
  const farm = rich();
  const from = point(-5.25, -.7), to = point(-1.25, -.7);
  const painted = paintSoil(farm, from, to);
  assert.equal(painted.ok, true);
  assert.ok(painted.changedIndices.length >= 4);
  assert.ok(painted.changedIndices.length <= 8);
  assert.equal(painted.state.coins, farm.coins - painted.changedIndices.length * FARM.patchCost);
  assert.equal(painted.state.patches.length, farm.patches.length + painted.changedIndices.length);
  for (let x = from.x; x <= to.x; x += .13) {
    assert.notEqual(findPatchIndex(painted.state, point(x, -.7)), -1, "Gap in brush stroke at " + x);
  }
  const repeat = paintSoil(painted.state, from, to);
  assert.equal(repeat.ok, false);
  assert.equal(repeat.state, painted.state);
  assert.equal(painted.state.patches.length, painted.state.patches.length);
});

test("painting respects owned land, limited coins, and maximum density", () => {
  const farm = rich();
  assert.equal(paintSoil(farm, point(99, 99), point(100, 100)).ok, false);
  assert.equal(paintSoil(farm, null, point(0, 0)).ok, false);
  const funds = { ...farm, coins: FARM.patchCost };
  const stroke = paintSoil(funds, point(-5.15, -.65), point(-1.3, -.65));
  assert.equal(stroke.ok, true);
  assert.equal(stroke.changedIndices.length, 1);
  assert.equal(stroke.state.coins, 0);
  assert.equal(paintSoil(stroke.state, point(-1.3, -.65), point(-.9, -.65)).ok, false);
  assert.equal(createPlot({ ...farm, patches: Array(FARM.maxPatches).fill(farm.patches[0]) }, point(-2, -.7)).ok, false);
});

test("expansion buys continuous land without creating new soil automatically", () => {
  const initial = rich(), oldBounds = landBounds(initial.landLevel);
  assert.equal(nextExpansionCost(initial), 85);
  const first = expandFarm(initial);
  assert.equal(first.ok, true);
  assert.equal(first.state.landLevel, 3);
  assert.equal(first.state.coins, initial.coins - 85);
  assert.deepEqual(first.state.patches, initial.patches);
  assert.ok(landBounds(first.state.landLevel).maxZ > oldBounds.maxZ);
  assert.equal(onLand(initial, point(-3, 2.3)), false);
  assert.equal(onLand(first.state, point(-3, 2.3)), true);
  assert.equal(createPlot(first.state, point(-3, 2.3)).ok, true);
  assert.equal(nextExpansionCost(first.state), 180);
  const final = expandFarm(first.state);
  assert.equal(final.ok, true);
  assert.equal(final.state.landLevel, 4);
  assert.equal(nextExpansionCost(final.state), null);
  assert.equal(expandFarm(final.state).ok, false);
  assert.equal(expandFarm(newFarm()).ok, false);
});

test("wheat planting, watering and harvest act on the chosen freeform patch", () => {
  const initial = rich();
  assert.equal(plant(initial, 0, "pumpkin", 1000).ok, false);
  assert.equal(plant(initial, 999, "wheat", 1000).ok, false);
  const planted = plant(initial, 1, "wheat", 1000);
  assert.equal(planted.ok, true);
  assert.equal(planted.state.patches[1].content.readyAt, 1000 + CROPS.wheat.growMs);
  assert.equal(initial.patches[1].content, null);
  assert.equal(plant(planted.state, 1, "wheat", 1000).ok, false);
  assert.equal(water(planted.state, 1, 90000).ok, false);
  const watered = water(planted.state, 1, 2000);
  assert.equal(watered.ok, true);
  assert.deepEqual(watered.wateredIndices, [1]);
  assert.equal(water(watered.state, 1, 3000).ok, false);
  assert.equal(harvest(watered.state, 1, 3000).ok, false);
  const harvested = harvest(watered.state, 1, 90000);
  assert.equal(harvested.ok, true);
  assert.equal(harvested.state.harvested, 1);
  assert.equal(harvested.state.patches[1].content, null);
  assert.equal(harvested.state.patches[1].x, initial.patches[1].x);
  assert.equal(growthStage(planted.state.patches[1].content, Infinity), 3);
  assert.equal(secondsRemaining(planted.state.patches[1].content, 90000), 0);
});

test("sprinklers cover world-space neighbors including diagonal patches", () => {
  const original = rich();
  const planted = plant(original, 1, "wheat", 1000).state;
  const next = plant(planted, 2, "wheat", 1000).state;
  const placed = placeSprinkler(next, 0, 2000);
  assert.equal(placed.ok, true);
  assert.deepEqual(placed.wateredIndices, [1, 2]);
  assert.equal(placed.state.coins, next.coins - SPRINKLER.cost);
  assert.equal(placed.state.patches[1].content.watered, true);
  assert.equal(placed.state.patches[2].content.watered, true);
  assert.equal(next.patches[1].content.watered, false);
  assert.equal(coveredBySprinkler(placed.state, 3), true);
  assert.equal(nearbySprinkler(placed.state, 3), 0);
  assert.equal(isSprinkler(placed.state.patches[0].content), true);
  assert.equal(placeSprinkler(placed.state, 0).ok, false);
  assert.equal(water(placed.state, 0).ok, false);
  assert.equal(harvest(placed.state, 0).ok, false);

  const seed = plant(placed.state, 3, "wheat", 3000);
  assert.deepEqual(seed.wateredIndices, [3]);
  assert.equal(seed.state.patches[3].content.watered, true);
  const later = harvest(seed.state, 3, 90000);
  assert.equal(plant(later.state, 3, "wheat", 91000).state.patches[3].content.watered, true);
});

test("sprinkler placement cannot rewater ripe or already watered crops", () => {
  const original = rich();
  const first = plant(original, 1, "wheat", 1000).state;
  const watered = water(first, 1, 2000).state;
  const placed = placeSprinkler(watered, 0, 3000);
  assert.deepEqual(placed.wateredIndices, []);
  const ripe = plant(original, 1, "wheat", 1000).state;
  const late = placeSprinkler(ripe, 0, 90000);
  assert.deepEqual(late.wateredIndices, []);
  assert.equal(late.state.patches[1].content.watered, false);
});

test("v5 saves roundtrip and reject malformed geometry or content", () => {
  const store = storage();
  const initial = rich();
  const painted = paintSoil(initial, point(-4, -.9), point(-1.7, -.9)).state;
  const planted = plant(painted, 0, "wheat", 1000).state;
  const sprinkler = placeSprinkler(planted, 1, 2000).state;
  assert.equal(saveFarm(sprinkler, store), true);
  assert.deepEqual(loadFarm(store), sprinkler);
  const invalid = [
    { ...initial, landLevel: 9 },
    { ...initial, coins: -1 },
    { ...initial, patches: [{ x: 100, z: 100, content: null }] },
    { ...initial, patches: [{ x: NaN, z: 0, content: null }] },
    { ...initial, patches: [{ ...initial.patches[0], content: { kind: "sprinkler", extra: 1 } }] },
    { ...initial, patches: [{ ...initial.patches[0], content: { cropId: "missing", plantedAt: 0, readyAt: 100, watered: false } }] },
    { ...initial, patches: [initial.patches[0], { ...initial.patches[0] }] },
  ];
  for (const item of invalid) {
    store.setItem(SAVE_KEY, JSON.stringify(item));
    assert.deepEqual(loadFarm(store), newFarm());
  }
  clearFarm(store);
  assert.deepEqual(loadFarm(store), newFarm());
});

test("v1-v4 saves migrate all existing prepared patches and preserve old crops", () => {
  const store = storage();
  const legacy = (version, level) => ({
    version, coins: 31, harvested: 7, unlockedRows: level,
    plots: Array(LEGACY_PLOT_COUNT).fill(null),
  });
  const oldCrop = { cropId: "pumpkin", plantedAt: 1000, readyAt: 66000, watered: false };
  for (const version of [1, 2, 3, 4]) {
    const old = legacy(version, version === 1 ? 4 : 3);
    const index = version === 1 ? 19 : 14;
    old.plots[index] = oldCrop;
    if (version === 4) {
      old.tilled = Array(LEGACY_PLOT_COUNT).fill(false);
      old.tilled[0] = true;
      old.tilled[index] = true;
    }
    if (version === 3) old.plots[0] = { kind: "sprinkler" };
    store.setItem(SAVE_KEY, JSON.stringify(old));
    const migrated = loadFarm(store);
    assert.equal(migrated.version, SAVE_VERSION);
    assert.equal(migrated.coins, 31);
    assert.equal(migrated.harvested, 7);
    assert.equal(migrated.landLevel, version === 1 ? 4 : 3);
    const at = legacyPlotPosition(index);
    const patch = migrated.patches.find(p => p.x === at.x && p.z === at.z);
    assert.deepEqual(patch.content, oldCrop);
    assert.equal(harvest(migrated, migrated.patches.indexOf(patch), 90000).ok, true);
    if (version === 3) assert.ok(migrated.patches.some(p => isSprinkler(p.content)));
    assert.equal(migrated.patches.length, version === 4 ? 2 : (version === 1 ? 20 : 15));
  }
  store.setItem(SAVE_KEY, '{"version":4,"plots":[]}');
  assert.deepEqual(loadFarm(store), newFarm());
});

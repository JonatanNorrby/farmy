import test from "node:test";
import assert from "node:assert/strict";
import { CROPS, FARM, LEGACY_PLOT_COUNT, SPRINKLER, legacyPlotPosition, landBounds } from "../src/config/crops.js";
import { SAVE_VERSION, newFarm, onLand, isPrepared, findSoilIndex, findPlantIndex,
  createPlot, paintSoil, expandFarm, nextExpansionCost, placeSprinkler,
  coveredBySprinkler, nearbySprinkler, plant, water, harvest, growthStage,
  secondsRemaining } from "../src/game/farm.js";
import { SAVE_KEY, loadFarm, saveFarm, clearFarm } from "../src/game/storage.js";

const point = (x,z) => ({ x,z });
const rich = (coins = 500) => ({ ...newFarm(), coins, inventory: { wheat: 100, sprinkler: 100 } });
const storage = () => {
  const data = new Map();
  return { getItem: key => data.get(key) ?? null, setItem: (key,value) => data.set(key,value),
    removeItem: key => data.delete(key) };
};

test("new farms have a continuous painted mask and no implicit crop slots", () => {
  const farm = newFarm();
  assert.equal(farm.version, 8);
  assert.equal(farm.coins, 64);
  assert.equal(farm.landLevel, 2);
  assert.equal(farm.soil.length, 4);
  assert.deepEqual(farm.plants, []);
  assert.deepEqual(farm.sprinklers, []);
  assert.equal(Object.hasOwn(farm, "patches"), false);
  assert.equal(isPrepared(farm, farm.soil[0]), true);
  assert.equal(isPrepared(farm, point(-3,0)), false);
  assert.equal(findSoilIndex(farm, point(-3,0)), -1);
  assert.equal(findPlantIndex(farm, farm.soil[0]), -1);
  assert.equal(onLand(farm, point(-3,-1)), true);
  assert.equal(onLand(farm, point(NaN,0)), false);
});

test("soil brush creates arbitrary world-space coverage without hidden plot occupancy", () => {
  const farm = rich();
  const p = point(-3.37,-1.93);
  const added = createPlot(farm,p);
  assert.equal(added.ok,true);
  assert.deepEqual(added.state.soil.at(-1), p);
  assert.equal(added.state.coins, farm.coins - FARM.patchCost);
  assert.equal(farm.soil.length,4);
  assert.equal(createPlot(added.state,p).ok,false);
  assert.equal(createPlot(farm,point(50,50)).ok,false);
  assert.equal(createPlot({ ...farm, coins: 0 },p).ok,false);
  const painted = paintSoil(farm,point(-5.25,-.7),point(-1.25,-.7));
  assert.equal(painted.ok,true);
  assert.ok(painted.changedIndices.length >= 4);
  for(let x=-5.25;x<=-1.25;x+=.1)
    assert.equal(isPrepared(painted.state,point(x,-.7)),true,"Soil stroke gap near "+x);
  assert.equal(paintSoil(painted.state,point(-5.25,-.7),point(-1.25,-.7)).ok,false);
  const funded = paintSoil({ ...farm, coins: FARM.patchCost },point(-5.25,-.7),point(-1.25,-.7));
  assert.equal(funded.changedIndices.length,1);
  assert.equal(funded.state.coins,0);
  assert.equal(createPlot({ ...farm, soil: Array(FARM.maxPatches).fill(farm.soil[0]) },p).ok,false);
});
test("expansion unlocks grass only and independent soil can be painted later", () => {
  const before = rich(), bounds = landBounds(before.landLevel);
  const result = expandFarm(before);
  assert.equal(result.ok,true);
  assert.deepEqual(result.state.soil,before.soil);
  assert.deepEqual(result.state.plants,before.plants);
  assert.ok(landBounds(result.state.landLevel).maxZ > bounds.maxZ);
  assert.equal(onLand(before,point(-3,2.3)),false);
  assert.equal(onLand(result.state,point(-3,2.3)),true);
  assert.equal(createPlot(result.state,point(-3,2.3)).ok,true);
  assert.equal(nextExpansionCost(result.state),180);
  assert.equal(expandFarm(expandFarm(result.state).state).ok,false);
  assert.equal(expandFarm(newFarm()).ok,false);
});
test("a crop can be painted at any point inside soil, not only at stamp centers", () => {
  const farm = rich(), at = point(-8.3,-3.3);
  assert.equal(isPrepared(farm,at),true);
  assert.ok(farm.soil.every(mark => mark.x !== at.x || mark.z !== at.z));
  const planted = plant(farm,at,"wheat",1000);
  assert.equal(planted.ok,true);
  assert.deepEqual({ x: planted.state.plants[0].x, z: planted.state.plants[0].z },at);
  assert.equal(planted.state.plants[0].readyAt,1000 + CROPS.wheat.growMs);
  assert.deepEqual(planted.state.soil,farm.soil);
  assert.equal(farm.plants.length,0);
  assert.equal(findPlantIndex(planted.state,at),0);
  assert.equal(plant(planted.state,point(-8.4,-3.3),"wheat",1001).ok,false);
  assert.equal(plant(farm,point(-3,0),"wheat",1000).ok,false);
  assert.equal(plant(farm,at,"pumpkin",1000).ok,false);
});
test("harvesting deletes just the crop, leaving the painted surface intact", () => {
  const farm = rich(), planted = plant(farm,point(-8.3,-3.3),"wheat",1000);
  const watered = water(planted.state,0,2000);
  assert.equal(watered.ok,true);
  assert.equal(water(watered.state,0,2500).ok,false);
  assert.equal(harvest(watered.state,0,2500).ok,false);
  const gathered = harvest(watered.state,0,90000);
  assert.equal(gathered.ok,true);
  assert.equal(gathered.state.plants.length,0);
  assert.deepEqual(gathered.state.soil,farm.soil);
  assert.equal(gathered.state.harvestBag.wheat,1);
  assert.equal(gathered.state.coins,farm.coins);
  assert.equal(plant(gathered.state,point(-8.3,-3.3),"wheat",91000).ok,true);
  assert.equal(growthStage(planted.state.plants[0],Infinity),3);
  assert.equal(secondsRemaining(planted.state.plants[0],90000),0);
});
test("a sprinkler is an independent spatial entity and covers nearby crops", () => {
  const before = rich();
  const first = plant(before,point(-6.4,-3.5),"wheat",1000).state;
  const second = plant(first,point(-8.6,-1.3),"wheat",1000).state;
  const placed = placeSprinkler(second,point(-8.6,-3.5),2000);
  assert.equal(placed.ok,true);
  assert.deepEqual(placed.wateredIndices,[0,1]);
  assert.equal(placed.sprinklerIndex,0);
  assert.deepEqual(placed.state.sprinklers,[point(-8.6,-3.5)]);
  assert.equal(placed.state.inventory.sprinkler,99);
  assert.equal(placed.state.coins,before.coins);
  assert.equal(placed.state.plants[0].watered,true);
  assert.equal(second.plants[0].watered,false);
  assert.equal(nearbySprinkler(placed.state,second.plants[0]),0);
  assert.equal(coveredBySprinkler(placed.state,point(-6.4,-3.5)),true);
  assert.equal(placeSprinkler(placed.state,point(-8.6,-3.5)).ok,false);
  assert.equal(plant(placed.state,point(-8.6,-3.5),"wheat").ok,false);
  const ripe = plant(before,point(-6.4,-3.5),"wheat",1000).state;
  assert.deepEqual(placeSprinkler(ripe,point(-8.6,-3.5),90000).wateredIndices,[]);
});
test("v8 round-trips arbitrary world positions, timers, stock and harvest bags", () => {
  const store = storage();
  let farm = rich();
  farm = paintSoil(farm,point(-5,-.8),point(-1,-.8)).state;
  farm = plant(farm,point(-4.43,-.8),"wheat",1000).state;
  farm = placeSprinkler(farm,point(-8.6,-3.5),2000).state;
  assert.equal(saveFarm(farm,store),true);
  assert.deepEqual(loadFarm(store),farm);
  const invalid = [
    { ...farm, landLevel: 9 },
    { ...farm, inventory: { wheat: -1, sprinkler: 0 } },
    { ...farm, harvestBag: { carrot: 0, wheat: 11, pumpkin: 0 } },
    { ...farm, soil: [point(99,99)] },
    { ...farm, soil: [farm.soil[0],{ ...farm.soil[0] }] },
    { ...farm, plants: [{ ...farm.plants[0], x: 99 }] },
    { ...farm, plants: [{ ...farm.plants[0], cropId: "invalid" }] },
    { ...farm, plants: [farm.plants[0],{ ...farm.plants[0] }] },
    { ...farm, sprinklers: [point(99,99)] },
    { ...farm, sprinklers: [{ ...farm.plants[0] }] },
    { ...farm, plants: [{ ...farm.plants[0], watered: "yes" }] },
  ];
  for (const item of invalid) {
    store.setItem(SAVE_KEY,JSON.stringify(item));
    assert.deepEqual(loadFarm(store),newFarm());
  }
  clearFarm(store);
  assert.deepEqual(loadFarm(store),newFarm());
});
test("v1-v4 grid saves migrate positions, crops and sprinklers without a grid in live data", () => {
  const store = storage(), crop = { cropId: "pumpkin", plantedAt: 1000, readyAt: 66000, watered: false };
  for (const version of [1,2,3,4]) {
    const level = version === 1 ? 4 : 3;
    const old = { version, coins: 31, harvested: 7, unlockedRows: level,
      plots: Array(LEGACY_PLOT_COUNT).fill(null) };
    const index = version === 1 ? 19 : 14;
    old.plots[index] = crop;
    if (version === 4) {
      old.tilled = Array(LEGACY_PLOT_COUNT).fill(false);
      old.tilled[0] = true;
      old.tilled[index] = true;
    }
    if (version === 3) old.plots[0] = { kind: "sprinkler" };
    store.setItem(SAVE_KEY,JSON.stringify(old));
    const migrated = loadFarm(store);
    assert.equal(migrated.version,SAVE_VERSION);
    assert.equal(migrated.coins,31);
    assert.deepEqual(migrated.inventory,{ wheat: 10, sprinkler: 0 });
    assert.deepEqual(migrated.harvestBag,{ carrot: 0, wheat: 0, pumpkin: 0 });
    const at = legacyPlotPosition(index);
    assert.deepEqual(migrated.plants[0],{ ...at, ...crop });
    assert.equal(migrated.soil.length, version === 4 ? 2 : version === 1 ? 20 : 15);
    if(version===3) assert.deepEqual(migrated.sprinklers[0],legacyPlotPosition(0));
    assert.equal(Object.hasOwn(migrated,"patches"),false);
    assert.equal(harvest(migrated,0,90000).ok,true);
  }
});
test("v5-v7 crop-in-dab saves migrate all entities, retaining independent positions", () => {
  const store = storage(), base = newFarm();
  for (const version of [5,6,7]) {
    const raw = { version, landLevel: 2, coins: 81, harvested: 12,
      patches: base.soil.map(mark => ({ ...mark, content: null })) };
    raw.patches[0].content = { cropId: "carrot", plantedAt: 1000, readyAt: 26000, watered: false };
    raw.patches[1].content = { kind: "sprinkler" };
    if (version >= 6) raw.inventory = { wheat: 7, sprinkler: 2 };
    if (version >= 7) raw.harvestBag = { carrot: 1, wheat: 2, pumpkin: 0 };
    store.setItem(SAVE_KEY,JSON.stringify(raw));
    const state = loadFarm(store);
    assert.equal(state.version,SAVE_VERSION);
    assert.deepEqual(state.soil,base.soil);
    assert.deepEqual(state.plants[0],{ ...base.soil[0], ...raw.patches[0].content });
    assert.deepEqual(state.sprinklers,[base.soil[1]]);
    assert.deepEqual(state.inventory,version >=6 ? raw.inventory : { wheat:10, sprinkler:0 });
    assert.deepEqual(state.harvestBag,version>=7 ? raw.harvestBag : { carrot:0, wheat:0, pumpkin:0 });
    assert.equal(state.coins,81);
    assert.equal(saveFarm(state,store),true);
    assert.deepEqual(loadFarm(store),state);
  }
});

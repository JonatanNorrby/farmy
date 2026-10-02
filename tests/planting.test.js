import test from "node:test";
import assert from "node:assert/strict";
import { CROPS, FARM } from "../src/config/crops.js";
import { newFarm, buyShopItem, paintSoil, paintSeeds, plant, harvest,
  placeSprinkler, isPrepared } from "../src/game/farm.js";
import { loadFarm, saveFarm } from "../src/game/storage.js";

const point = (x,z) => ({ x,z });
const bag = (coins = 300) => buyShopItem({ ...newFarm(), coins }, "wheat").state;
const storage = () => {
  const data = new Map();
  return { getItem: key => data.get(key) ?? null, setItem: (key,value) => data.set(key,value) };
};

test("a continuous seed stroke follows world-space ground rather than the soil dab centers", () => {
  const initial = bag();
  const prepared = paintSoil(initial,point(-5.2,-.7),point(-1.35,-.7));
  assert.equal(prepared.ok,true);
  const before = prepared.state.coins;
  const result = paintSeeds(prepared.state,point(-5.2,-.7),point(-1.35,-.7),"wheat",1000);
  assert.equal(result.ok,true);
  assert.ok(result.plantedIndices.length >= 4);
  assert.equal(result.state.plants.length,result.plantedIndices.length);
  assert.equal(result.state.inventory.wheat,10-result.plantedIndices.length);
  assert.equal(result.state.coins,before);
  assert.deepEqual(result.state.soil,prepared.state.soil);
  for (const crop of result.state.plants) {
    assert.equal(crop.cropId,"wheat");
    assert.equal(crop.readyAt,1000+CROPS.wheat.growMs);
    assert.equal(isPrepared(result.state,crop),true);
  }
  // Crops must not snap to the coordinates of the soil brush's own stamps.
  assert.ok(result.state.plants.some(crop =>
    prepared.state.soil.every(mark => Math.hypot(crop.x-mark.x,crop.z-mark.z)>.05)));
});
test("sowing a wide painted region fills multiple rows under the brush footprint", () => {
  let state = { ...newFarm(), coins: 500, inventory: { wheat: 100, sprinkler: 0 } };
  for (const z of [-1.5,-.75,0]) {
    state = paintSoil(state,point(-5,z),point(-1,z)).state;
  }
  const planted = paintSeeds(state,point(-5,-.75),point(-1,-.75),"wheat",1000);
  assert.equal(planted.ok,true);
  assert.ok(planted.state.plants.some(crop => crop.z < -1.1));
  assert.ok(planted.state.plants.some(crop => crop.z > -.4));
  assert.ok(planted.state.plants.some(crop => Math.abs(crop.z+.75)<.1));
  assert.ok(planted.state.plants.every(crop => isPrepared(state,crop)));
  for(let i=0;i<planted.state.plants.length;i++)for(let j=0;j<i;j++){
    const a=planted.state.plants[i],b=planted.state.plants[j];
    assert.ok(Math.hypot(a.x-b.x,a.z-b.z)>=FARM.seedSpacing-.025);
  }
});
test("overlapping strokes only spend seeds on new plants, with no arbitrary soil-slot capacity", () => {
  let state=bag();
  state=paintSoil(state,point(-5,-.8),point(-1.5,-.8)).state;
  const first=paintSeeds(state,point(-5,-.8),point(-1.5,-.8),"wheat",1000);
  assert.equal(first.ok,true);
  const repeat=paintSeeds(first.state,point(-5,-.8),point(-1.5,-.8),"wheat",2000);
  assert.equal(repeat.ok,false);
  assert.equal(repeat.state,first.state);
  assert.equal(first.state.inventory.wheat,10-first.plantedIndices.length);
  assert.equal(state.plants.length,0);
});
test("seed depletion obeys stroke direction and never spends a second charge", () => {
  const original = { ...newFarm(), inventory: { wheat: 1, sprinkler: 0 } };
  const back = paintSeeds(original,point(-6.4,-3.5),point(-8.6,-3.5),"wheat",1000);
  assert.equal(back.ok,true);
  assert.equal(back.plantedIndices.length,1);
  assert.ok(back.state.plants[0].x > -7);
  assert.equal(back.state.inventory.wheat,0);
  assert.match(back.message,/Bag empty/);
  assert.equal(paintSeeds(back.state,point(-8.6,-3.5),point(-8.6,-3.5)).ok,false);
  assert.equal(back.state.coins,original.coins);
});
test("planting never invents soil or overwrites a sprinkler, growing crop or legacy crop", () => {
  const initial=bag(400);
  assert.equal(paintSeeds(initial,point(-3,0),point(-1,0)).ok,false);
  assert.equal(paintSeeds(initial,null,point(-8.6,-3.5)).ok,false);
  assert.equal(paintSeeds(initial,point(NaN,0),point(-8.6,-3.5)).ok,false);
  assert.equal(paintSeeds(initial,point(-8.6,-3.5),point(-8.6,-3.5),"pumpkin").ok,false);
  const bought=buyShopItem(initial,"sprinkler").state;
  const placed=placeSprinkler(bought,point(-8.6,-3.5),1000).state;
  const growing=plant(placed,point(-6.4,-3.5),"wheat",1000).state;
  const legacy={ ...growing, plants: [...growing.plants,
    { x:-8.6,z:-1.3,cropId:"carrot",plantedAt:1000,readyAt:26000,watered:false }] };
  const count=legacy.inventory.wheat;
  const painted=paintSeeds(legacy,point(-8.6,-3.5),point(-6.4,-1.3),"wheat",2000);
  assert.equal(painted.ok,true);
  assert.equal(painted.state.sprinklers.length,1);
  assert.equal(painted.state.plants[0].plantedAt,1000);
  assert.equal(painted.state.plants[1].cropId,"carrot");
  assert.equal(painted.state.inventory.wheat,count-painted.plantedIndices.length);
});
test("crops painted near sprinklers are auto-watered and persist with independent positions", () => {
  let state=bag(400);
  state=buyShopItem(state,"sprinkler").state;
  state=placeSprinkler(state,point(-8.6,-3.5),1000).state;
  const painted=paintSeeds(state,point(-6.4,-3.5),point(-6.4,-1.3),"wheat",2000);
  assert.equal(painted.ok,true);
  assert.deepEqual(painted.wateredIndices,painted.plantedIndices);
  assert.ok(painted.state.plants.every(crop=>crop.watered));
  const store=storage();
  assert.equal(saveFarm(painted.state,store),true);
  assert.deepEqual(loadFarm(store),painted.state);
  const ready=harvest(painted.state,0,90000);
  assert.equal(ready.ok,true);
  assert.equal(ready.state.plants.length,painted.state.plants.length-1);
  assert.equal(ready.state.soil.length,painted.state.soil.length);
});

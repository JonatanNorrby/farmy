import test from "node:test";
import assert from "node:assert/strict";
import { CROPS } from "../src/config/crops.js";
import { EMPTY_HARVEST_BAG, HARVEST_BAG_CAPACITY,
  harvestBagCount, harvestBagValue, validHarvestBag } from "../src/config/harvest.js";
import { SAVE_VERSION, newFarm, plant, harvest, sellHarvest } from "../src/game/farm.js";
import { SAVE_KEY, loadFarm, saveFarm } from "../src/game/storage.js";
function memoryStorage() {
  const values=new Map();
  return { getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,v) };
}
const at={x:-8.6,z:-3.5};
const ripe=(point,cropId)=>({ ...point,cropId,plantedAt:1000,readyAt:2000,watered:false });
function stockedFarm(crops) {
  const farm=newFarm();
  return { ...farm,inventory:{wheat:20,sprinkler:1},
    plants:crops.map((crop,i)=>ripe(farm.soil[i],crop)) };
}
test("collecting a ripe crop fills the bag and leaves the painted ground",()=>{
  const original=stockedFarm(["wheat"]),result=harvest(original,0,3000);
  assert.equal(result.ok,true);
  assert.equal(result.state.coins,original.coins);
  assert.equal(result.state.harvested,1);
  assert.deepEqual(result.state.harvestBag,{carrot:0,wheat:1,pumpkin:0});
  assert.equal(result.state.plants.length,0);
  assert.deepEqual(result.state.soil,original.soil);
  assert.equal(original.plants[0].cropId,"wheat");
  assert.equal(harvestBagCount(result.state.harvestBag),1);
  assert.equal(harvestBagValue(result.state.harvestBag),CROPS.wheat.reward);
  assert.equal(harvest(result.state,0,3001).ok,false);
});
test("historical crops preserve their rewards until the whole bag is sold",()=>{
  let state=stockedFarm(["wheat","carrot","pumpkin"]);
  for(let i=0;i<3;i++) {
    const result=harvest(state,0,3000); // array compacts after collecting
    assert.equal(result.ok,true);
    state=result.state;
  }
  const payout=CROPS.wheat.reward+CROPS.carrot.reward+CROPS.pumpkin.reward;
  assert.equal(state.coins,64);
  assert.equal(state.harvested,3);
  assert.deepEqual(state.harvestBag,{carrot:1,wheat:1,pumpkin:1});
  assert.equal(harvestBagCount(state.harvestBag),3);
  assert.equal(harvestBagValue(state.harvestBag),payout);
  const sold=sellHarvest(state);
  assert.equal(sold.ok,true);
  assert.equal(sold.state.coins,64+payout);
  assert.deepEqual(sold.state.harvestBag,EMPTY_HARVEST_BAG);
  assert.equal(harvestBagCount(state.harvestBag),3);
  assert.equal(sellHarvest(sold.state).ok,false);
});
test("a full ten-crop bag blocks the next harvest until sale",()=>{
  let state={ ...newFarm(),inventory:{wheat:11,sprinkler:0} };
  for(let i=0;i<HARVEST_BAG_CAPACITY;i++){
    const now=1000+i*100000;
    state=plant(state,at,"wheat",now).state;
    const gathered=harvest(state,0,now+CROPS.wheat.growMs+1);
    assert.equal(gathered.ok,true);
    state=gathered.state;
  }
  assert.equal(state.harvestBag.wheat,10);
  const now=1000+HARVEST_BAG_CAPACITY*100000;
  state=plant(state,at,"wheat",now).state;
  const blocked=harvest(state,0,now+CROPS.wheat.growMs+1);
  assert.equal(blocked.ok,false);
  assert.match(blocked.message,/bag full/i);
  assert.equal(blocked.state,state);
  assert.equal(state.plants[0].cropId,"wheat");
  const sold=sellHarvest(state);
  assert.equal(sold.ok,true);
  assert.equal(sold.state.coins,64+10*CROPS.wheat.reward);
  assert.equal(sold.state.inventory.wheat,0);
  const gathered=harvest(sold.state,0,now+CROPS.wheat.growMs+1);
  assert.equal(gathered.ok,true);
  assert.equal(gathered.state.harvestBag.wheat,1);
  assert.equal(gathered.state.harvested,11);
});
test("invalid harvests and empty bag sales do not mutate state",()=>{
  const farm=newFarm();
  assert.deepEqual(farm.harvestBag,EMPTY_HARVEST_BAG);
  assert.equal(sellHarvest(farm).ok,false);
  assert.equal(harvest(farm,0).ok,false);
  const growing={ ...farm,plants:[{ ...at,cropId:"wheat",plantedAt:1000,readyAt:9000,watered:false }] };
  assert.equal(harvest(growing,0,2000).ok,false);
  assert.equal(growing.harvestBag.wheat,0);
  const overflow={ ...farm,coins:Number.MAX_SAFE_INTEGER,
    harvestBag:{ ...EMPTY_HARVEST_BAG,pumpkin:1 } };
  assert.equal(sellHarvest(overflow).ok,false);
  assert.equal(overflow.harvestBag.pumpkin,1);
});
test("bag count validation survives independent crop saves",()=>{
  const store=memoryStorage();
  const saved={ ...newFarm(),harvestBag:{carrot:2,wheat:7,pumpkin:1},harvested:20 };
  assert.equal(harvestBagCount(saved.harvestBag),HARVEST_BAG_CAPACITY);
  assert.equal(validHarvestBag(saved.harvestBag),true);
  assert.equal(saveFarm(saved,store),true);
  assert.deepEqual(loadFarm(store),saved);
  for(const invalid of [null,[],{}, {carrot:0,wheat:1},
    {carrot:0,wheat:0,pumpkin:0,extra:1},{carrot:-1,wheat:0,pumpkin:0},
    {carrot:.5,wheat:0,pumpkin:0},{carrot:1,wheat:10,pumpkin:0},{carrot:NaN,wheat:0,pumpkin:0}]){
    assert.equal(validHarvestBag(invalid),false);
    store.setItem(SAVE_KEY,JSON.stringify({...saved,harvestBag:invalid}));
    assert.deepEqual(loadFarm(store),newFarm());
  }
});
test("v6 inventory and previous coins migrate without retroactively selling bag contents",()=>{
  const store=memoryStorage(),base=newFarm();
  const previous={ version:6,coins:418,harvested:32,landLevel:2,
    inventory:{wheat:7,sprinkler:2},
    patches:base.soil.map(mark=>({...mark,content:null})) };
  previous.patches[0].content={cropId:"pumpkin",plantedAt:1000,readyAt:2000,watered:false};
  store.setItem(SAVE_KEY,JSON.stringify(previous));
  const migrated=loadFarm(store);
  assert.equal(migrated.version,SAVE_VERSION);
  assert.equal(migrated.coins,418);
  assert.equal(migrated.harvested,32);
  assert.deepEqual(migrated.inventory,previous.inventory);
  assert.deepEqual(migrated.harvestBag,EMPTY_HARVEST_BAG);
  assert.deepEqual(migrated.soil,base.soil);
  assert.equal(migrated.plants[0].cropId,"pumpkin");
  const gathered=harvest(migrated,0,3000);
  assert.equal(gathered.ok,true);
  assert.equal(gathered.state.coins,418);
  assert.equal(gathered.state.harvestBag.pumpkin,1);
});

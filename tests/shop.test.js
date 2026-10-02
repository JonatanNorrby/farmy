import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { SHOP_ITEMS, INITIAL_STOCK, LEGACY_STARTER_STOCK, MAX_STOCK, validStock } from "../src/config/shop.js";
import { CROPS, SPRINKLER } from "../src/config/crops.js";
import { SAVE_VERSION, newFarm, buyShopItem, plant, harvest, sellHarvest, placeSprinkler } from "../src/game/farm.js";
import { SAVE_KEY, loadFarm, saveFarm } from "../src/game/storage.js";

const at = { x: -8.6, z: -3.5 };
const storage = () => {
  const items = new Map();
  return { getItem: key => items.get(key) ?? null, setItem: (key,value) => items.set(key,value) };
};
test("shop has Seeds and Buildings offers and ten-seed bundles", () => {
  assert.equal(SHOP_ITEMS.wheat.tab,"seeds");
  assert.equal(SHOP_ITEMS.wheat.quantity,10);
  assert.equal(SHOP_ITEMS.wheat.cost,30);
  assert.equal(SHOP_ITEMS.sprinkler.tab,"buildings");
  assert.equal(SHOP_ITEMS.sprinkler.quantity,1);
  assert.equal(SHOP_ITEMS.sprinkler.cost,SPRINKLER.cost);
  assert.deepEqual(newFarm().inventory,INITIAL_STOCK);
  assert.deepEqual(LEGACY_STARTER_STOCK,{ wheat:10,sprinkler:0 });
  const html=readFileSync(new URL("../index.html",import.meta.url),"utf8");
  for(const id of ["shop-toggle","shop-panel","shop-tab-seeds","shop-tab-buildings",
    "shop-seeds","shop-buildings","stock-wheat","stock-sprinkler"])
    assert.match(html,new RegExp('id="'+id+'"'));
  assert.match(html,/data-buy="wheat"/);
  assert.match(html,/data-buy="sprinkler"/);
});
test("buying a bag grants ten independent plants without charging again on sowing", () => {
  const initial=newFarm();
  assert.equal(plant(initial,at,"wheat",1000).ok,false);
  const purchase=buyShopItem(initial,"wheat");
  assert.equal(purchase.ok,true);
  assert.equal(purchase.state.coins,initial.coins-SHOP_ITEMS.wheat.cost);
  const planted=plant(purchase.state,at,"wheat",1000);
  assert.equal(planted.ok,true);
  assert.equal(planted.state.inventory.wheat,9);
  assert.equal(planted.state.coins,purchase.state.coins);
  assert.deepEqual({ x:planted.state.plants[0].x,z:planted.state.plants[0].z },at);
  const harvested=harvest(planted.state,0,1000+CROPS.wheat.growMs+1);
  assert.equal(harvested.ok,true);
  assert.equal(harvested.state.inventory.wheat,9);
  assert.equal(harvested.state.harvestBag.wheat,1);
  assert.equal(harvested.state.plants.length,0);
  assert.equal(sellHarvest(harvested.state).state.coins,purchase.state.coins+CROPS.wheat.reward);
});
test("bags are finite and crops may regrow at the same free position after harvest", () => {
  let state=buyShopItem(newFarm(),"wheat").state;
  for(let i=0;i<SHOP_ITEMS.wheat.quantity;i++){
    const now=1000+i*100000;
    const planted=plant(state,at,"wheat",now);
    assert.equal(planted.ok,true);
    state=harvest(planted.state,0,now+CROPS.wheat.growMs+1).state;
  }
  assert.equal(state.inventory.wheat,0);
  assert.equal(state.harvestBag.wheat,10);
  assert.equal(plant(state,at,"wheat",1001000).ok,false);
  assert.equal(buyShopItem(state,"wheat").state.inventory.wheat,10);
});
test("purchased sprinklers are placed at arbitrary painted coordinates, not soil slots", () => {
  const initial=newFarm();
  assert.equal(placeSprinkler(initial,at,1000).ok,false);
  const purchase=buyShopItem(initial,"sprinkler");
  assert.equal(purchase.ok,true);
  const placement={ x:-8.3,z:-3.3 };
  const placed=placeSprinkler(purchase.state,placement,1000);
  assert.equal(placed.ok,true);
  assert.deepEqual(placed.state.sprinklers,[placement]);
  assert.equal(placed.state.inventory.sprinkler,0);
  assert.equal(placed.state.coins,purchase.state.coins);
  assert.equal(placeSprinkler(placed.state,at,1001).ok,false);
});
test("shop rejects unknown, unaffordable and over-capacity purchases without mutation", () => {
  const initial=newFarm();
  for(const id of ["pumpkin","invalid","","__proto__"]){
    const result=buyShopItem(initial,id);
    assert.equal(result.ok,false,id);
    assert.equal(result.state,initial);
  }
  const poor={ ...initial,coins:0 };
  assert.equal(buyShopItem(poor,"wheat").ok,false);
  assert.equal(buyShopItem(poor,"sprinkler").ok,false);
  const full={ ...initial,inventory:{ wheat:MAX_STOCK-9,sprinkler:MAX_STOCK } };
  assert.equal(buyShopItem(full,"wheat").ok,false);
  assert.equal(buyShopItem(full,"sprinkler").ok,false);
  const fit={ ...initial,inventory:{ wheat:MAX_STOCK-10,sprinkler:0 } };
  assert.equal(buyShopItem(fit,"wheat").state.inventory.wheat,MAX_STOCK);
  assert.ok(validStock(fit.inventory));
  for(const item of [null,[],{wheat:-1,sprinkler:0},{wheat:.5,sprinkler:0},
    {wheat:Infinity,sprinkler:0},{wheat:0,sprinkler:0,extra:1}])
    assert.equal(validStock(item),false);
});
test("v5 and v6 patch saves migrate to independent entities with correct inventory", () => {
  const store=storage();
  const purchased=buyShopItem(buyShopItem({ ...newFarm(),coins:100 },"wheat").state,"sprinkler").state;
  assert.ok(saveFarm(purchased,store));
  assert.deepEqual(loadFarm(store),purchased);
  for(const version of [5,6]) {
    const previous={ version,coins:123,harvested:7,landLevel:2,
      patches:newFarm().soil.map(mark=>({ ...mark,content:null })) };
    previous.patches[0].content={ cropId:"carrot",plantedAt:1000,readyAt:26000,watered:false };
    previous.patches[1].content={ kind:"sprinkler" };
    if(version===6) previous.inventory={ wheat:6,sprinkler:1 };
    store.setItem(SAVE_KEY,JSON.stringify(previous));
    const migrated=loadFarm(store);
    assert.equal(migrated.version,SAVE_VERSION);
    assert.equal(migrated.coins,123);
    assert.equal(migrated.harvested,7);
    assert.deepEqual(migrated.inventory,version===5 ? LEGACY_STARTER_STOCK : previous.inventory);
    assert.equal(migrated.plants[0].cropId,"carrot");
    assert.deepEqual(migrated.sprinklers,[newFarm().soil[1]]);
    assert.equal(migrated.soil.length,4);
  }
  store.setItem(SAVE_KEY,JSON.stringify({ ...purchased,inventory:{wheat:-1,sprinkler:0} }));
  assert.deepEqual(loadFarm(store),newFarm());
});

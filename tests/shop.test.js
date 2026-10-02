import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { SHOP_ITEMS, INITIAL_STOCK, LEGACY_STARTER_STOCK, MAX_STOCK, validStock } from "../src/config/shop.js";
import { CROPS, SPRINKLER } from "../src/config/crops.js";
import { SAVE_VERSION, newFarm, buyShopItem, plant, harvest, placeSprinkler, isSprinkler } from "../src/game/farm.js";
import { SAVE_KEY, loadFarm, saveFarm } from "../src/game/storage.js";

const storage = () => {
  const items = new Map();
  return { getItem: key => items.get(key) ?? null, setItem: (key, value) => items.set(key, value) };
};

test("shop contains distinct Seeds and Buildings offers, including a bag of ten seeds", () => {
  assert.equal(SHOP_ITEMS.wheat.tab, "seeds");
  assert.equal(SHOP_ITEMS.wheat.quantity, 10);
  assert.equal(SHOP_ITEMS.wheat.cost, 30);
  assert.equal(SHOP_ITEMS.sprinkler.tab, "buildings");
  assert.equal(SHOP_ITEMS.sprinkler.quantity, 1);
  assert.equal(SHOP_ITEMS.sprinkler.cost, SPRINKLER.cost);
  assert.deepEqual(newFarm().inventory, INITIAL_STOCK);
  assert.deepEqual(LEGACY_STARTER_STOCK, { wheat: 10, sprinkler: 0 });
  const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
  for (const id of ["shop-toggle", "shop-panel", "shop-tab-seeds", "shop-tab-buildings",
    "shop-seeds", "shop-buildings", "stock-wheat", "stock-sprinkler"]) {
    assert.match(html, new RegExp('id="' + id + '"'));
  }
  assert.match(html, /data-buy="wheat"/);
  assert.match(html, /data-buy="sprinkler"/);
});

test("buying one bag adds 10 seeds once; planting consumes seeds without a second coin charge", () => {
  const initial = newFarm();
  assert.equal(plant(initial, 0, "wheat", 1000).ok, false);
  const purchase = buyShopItem(initial, "wheat");
  assert.equal(purchase.ok, true);
  assert.equal(purchase.state.coins, initial.coins - SHOP_ITEMS.wheat.cost);
  assert.equal(purchase.state.inventory.wheat, 10);
  assert.deepEqual(initial.inventory, { wheat: 0, sprinkler: 0 });
  const planted = plant(purchase.state, 0, "wheat", 1000);
  assert.equal(planted.ok, true);
  assert.equal(planted.state.inventory.wheat, 9);
  assert.equal(planted.state.coins, purchase.state.coins);
  assert.equal(planted.state.patches[0].content.cropId, "wheat");
  const harvested = harvest(planted.state, 0, 1000 + CROPS.wheat.growMs + 1);
  assert.equal(harvested.ok, true);
  assert.equal(harvested.state.inventory.wheat, 9);
  assert.equal(harvested.state.coins, purchase.state.coins + CROPS.wheat.reward);
});

test("a wheat bag is finite and requires another purchase after ten uses", () => {
  let state = buyShopItem(newFarm(), "wheat").state;
  for (let i = 0; i < SHOP_ITEMS.wheat.quantity; i++) {
    const now = 1000 + i * 100000;
    const planted = plant(state, 0, "wheat", now);
    assert.equal(planted.ok, true);
    state = harvest(planted.state, 0, now + CROPS.wheat.growMs + 1).state;
  }
  assert.equal(state.inventory.wheat, 0);
  const empty = plant(state, 0, "wheat", 1001000);
  assert.equal(empty.ok, false);
  assert.equal(empty.state, state);
  assert.equal(buyShopItem(state, "wheat").state.inventory.wheat, 10);
});

test("Buildings purchase gives an unplaced sprinkler, placement consumes only inventory", () => {
  const initial = newFarm();
  assert.equal(placeSprinkler(initial, 0, 1000).ok, false);
  const purchase = buyShopItem(initial, "sprinkler");
  assert.equal(purchase.ok, true);
  assert.equal(purchase.state.coins, initial.coins - SPRINKLER.cost);
  assert.equal(purchase.state.inventory.sprinkler, 1);
  const placed = placeSprinkler(purchase.state, 0, 1000);
  assert.equal(placed.ok, true);
  assert.equal(placed.state.coins, purchase.state.coins);
  assert.equal(placed.state.inventory.sprinkler, 0);
  assert.equal(isSprinkler(placed.state.patches[0].content), true);
  assert.equal(placeSprinkler(placed.state, 1, 1000).ok, false);
});

test("shop rejects unknown, unaffordable or over-capacity transactions without mutation", () => {
  const initial = newFarm();
  for (const id of ["pumpkin", "invalid", "", "__proto__"]) {
    const result = buyShopItem(initial, id);
    assert.equal(result.ok, false, id);
    assert.equal(result.state, initial);
  }
  const poor = { ...initial, coins: 0 };
  assert.equal(buyShopItem(poor, "wheat").ok, false);
  assert.equal(buyShopItem(poor, "sprinkler").ok, false);
  const full = { ...initial, inventory: { wheat: MAX_STOCK - 9, sprinkler: MAX_STOCK } };
  assert.equal(buyShopItem(full, "wheat").ok, false);
  assert.equal(buyShopItem(full, "sprinkler").ok, false);
  assert.equal(full.inventory.wheat, MAX_STOCK - 9);
  const exactlyFits = { ...initial, inventory: { wheat: MAX_STOCK - 10, sprinkler: 0 } };
  assert.equal(buyShopItem(exactlyFits, "wheat").state.inventory.wheat, MAX_STOCK);
  assert.ok(validStock(exactlyFits.inventory));
  for (const value of [null, [], { wheat: -1, sprinkler: 0 }, { wheat: .5, sprinkler: 0 },
    { wheat: Infinity, sprinkler: 0 }, { wheat: 0, sprinkler: 0, extra: 1 }]) {
    assert.equal(validStock(value), false);
  }
});

test("v6 saves retain purchased inventory; v5 migration grants starter seeds without altering old assets", () => {
  const store = storage();
  const purchased = buyShopItem(buyShopItem(newFarm(), "wheat").state, "sprinkler").state;
  assert.ok(saveFarm(purchased, store));
  assert.deepEqual(loadFarm(store), purchased);
  const old = { ...newFarm(), version: 5, coins: 123, harvested: 7 };
  delete old.inventory;
  old.patches[0] = { ...old.patches[0],
    content: { cropId: "carrot", plantedAt: 1000, readyAt: 26000, watered: false } };
  old.patches[1] = { ...old.patches[1], content: { kind: "sprinkler" } };
  store.setItem(SAVE_KEY, JSON.stringify(old));
  const migrated = loadFarm(store);
  assert.equal(migrated.version, SAVE_VERSION);
  assert.equal(migrated.coins, 123);
  assert.equal(migrated.harvested, 7);
  assert.deepEqual(migrated.inventory, LEGACY_STARTER_STOCK);
  assert.deepEqual(migrated.patches, old.patches);
  store.setItem(SAVE_KEY, JSON.stringify({ ...purchased, inventory: { wheat: -1, sprinkler: 0 } }));
  assert.deepEqual(loadFarm(store), newFarm());
});

import test from "node:test";
import assert from "node:assert/strict";
import { createInterface } from "../src/ui/interface.js";
import { newFarm, buyShopItem } from "../src/game/farm.js";

class FakeElement {
  constructor(dataset = {}) {
    this.dataset = dataset;
    this.hidden = false;
    this.disabled = false;
    this.attributes = new Map();
    this.listeners = new Map();
    this.classList = { toggle() {}, add() {}, remove() {} };
    this.style = { width: "" };
    this.parentElement = { hidden: false };
    this.cost = { textContent: "" };
    this.tabIndex = 0;
    this.value = "";
    this.textContent = "";
    this.title = "";
  }
  addEventListener(name, handler) {
    const handlers = this.listeners.get(name) ?? [];
    handlers.push(handler);
    this.listeners.set(name, handlers);
  }
  fire(name, event = {}) {
    for (const handler of this.listeners.get(name) ?? []) handler(event);
  }
  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  getAttribute(name) { return this.attributes.get(name); }
  querySelector(selector) { return selector === ".tool-cost" ? this.cost : null; }
  focus() { FakeElement.focused = this; }
  contains(target) { return target === this; }
}
function fixture() {
  const ids = ["coins", "harvested", "harvest-counter", "bag-count", "sell-harvest", "inspector", "plot-detail", "inspect-title",
    "inspect-text", "inspect-progress", "toast", "expand-farm", "settings-toggle",
    "settings-panel", "settings-close", "brightness", "brightness-value", "brightness-reset",
    "shop-toggle", "shop-panel", "shop-close", "shop-coins", "stock-wheat",
    "stock-sprinkler", "reset"];
  const nodes = Object.fromEntries(ids.map(id => [id, new FakeElement()]));
  nodes["settings-panel"].hidden = true;
  nodes["shop-panel"].hidden = true;
  const tools = ["wheat", "water", "sprinkler", "plot"].map(id => new FakeElement({ tool: id }));
  const tabs = ["seeds", "buildings"].map(id => new FakeElement({ shopTab: id }));
  const panels = ["seeds", "buildings"].map(id => new FakeElement({ shopPanel: id }));
  panels[1].hidden = true;
  const purchases = ["wheat", "sprinkler"].map(id => new FakeElement({ buy: id }));
  const document = new FakeElement();
  document.querySelector = selector => nodes[selector.slice(1)] ?? null;
  document.querySelectorAll = selector => ({
    "[data-tool]": tools, "[data-shop-tab]": tabs, "[data-shop-panel]": panels,
    "[data-buy]": purchases,
  })[selector] ?? [];
  const window = new FakeElement();
  const originalDocument = globalThis.document;
  const originalWindow = globalThis.window;
  globalThis.document = document;
  globalThis.window = window;
  return {
    nodes, tools, tabs, panels, purchases, document, window,
    restore() {
      globalThis.document = originalDocument;
      globalThis.window = originalWindow;
    },
  };
}

test("the Shop toggles accessible Seeds/Buildings tabs and coexists with Settings", () => {
  const f = fixture();
  try {
    const bought = [];
    let sellCalls = 0;
    const ui = createInterface({
      onToolChange() {}, onBuy: id => bought.push(id), onSell: () => { sellCalls++; }, onReset() {},
      onExpand() {}, onBrightnessChange() {}, brightness: 100,
    });
    const state = newFarm();
    ui.render(state, "wheat", state.patches[0]);
    assert.equal(f.nodes["inspect-text"].textContent, "Buy a wheat seed bag in Shop → Seeds.");
    assert.equal(f.nodes["shop-coins"].textContent, "✦ 64");
    assert.equal(f.nodes["bag-count"].textContent, "0/10");
    assert.equal(f.nodes["sell-harvest"].disabled, true);
    assert.equal(f.nodes["stock-wheat"].textContent, 0);
    assert.equal(f.tools[0].cost.textContent, "× 0");
    assert.equal(f.purchases[0].disabled, false);
    assert.equal(f.purchases[1].disabled, false);
    f.nodes["shop-toggle"].fire("click");
    assert.equal(f.nodes["shop-panel"].hidden, false);
    assert.equal(f.nodes["shop-toggle"].getAttribute("aria-expanded"), "true");
    assert.equal(f.tabs[0].getAttribute("aria-selected"), "true");
    assert.equal(f.panels[0].hidden, false);
    assert.equal(f.panels[1].hidden, true);
    f.tabs[1].fire("click");
    assert.equal(f.tabs[1].getAttribute("aria-selected"), "true");
    assert.equal(f.panels[0].hidden, true);
    assert.equal(f.panels[1].hidden, false);
    f.tabs[1].fire("keydown", { key: "ArrowLeft", preventDefault() {} });
    assert.equal(f.tabs[0].getAttribute("aria-selected"), "true");
    f.purchases[0].fire("click");
    assert.deepEqual(bought, ["wheat"]);
    const purchased = buyShopItem(state, "wheat").state;
    ui.render(purchased, "wheat", purchased.patches[0]);
    assert.equal(f.tools[0].cost.textContent, "× 10");
    assert.equal(f.nodes["stock-wheat"].textContent, 10);
    assert.equal(f.nodes["shop-coins"].textContent, "✦ 34");
    const filled = { ...purchased, harvestBag: { ...purchased.harvestBag, wheat: 2 } };
    ui.render(filled, "wheat", filled.patches[0]);
    assert.equal(f.nodes["bag-count"].textContent, "2/10");
    assert.equal(f.nodes["sell-harvest"].disabled, false);
    assert.equal(f.nodes["sell-harvest"].textContent, "Sell ✦ 38");
    f.nodes["sell-harvest"].fire("click");
    assert.equal(sellCalls, 1);
    const full = { ...purchased, harvestBag: { ...purchased.harvestBag, wheat: 10 } };
    ui.render(full, "wheat", null);
    assert.equal(f.nodes["bag-count"].textContent, "10/10");
    assert.equal(f.nodes["sell-harvest"].textContent, "Sell ✦ 190");
    assert.equal(f.nodes["harvest-counter"].getAttribute("aria-label"), "Harvest bag: 10 of 10 crops");
    assert.equal(f.purchases[0].disabled, false);
    assert.equal(f.purchases[1].disabled, true);
    assert.equal(f.nodes["shop-panel"].hidden, false); // Buying doesn't close the shop.
    f.nodes["settings-toggle"].fire("click");
    assert.equal(f.nodes["shop-panel"].hidden, true);
    assert.equal(f.nodes["settings-panel"].hidden, false);
    f.nodes["shop-toggle"].fire("click");
    assert.equal(f.nodes["settings-panel"].hidden, true);
    assert.equal(f.nodes["shop-panel"].hidden, false);
    f.window.fire("keydown", { key: "Escape" });
    assert.equal(f.nodes["shop-panel"].hidden, true);
    assert.equal(f.nodes["shop-toggle"].getAttribute("aria-expanded"), "false");
    assert.equal(FakeElement.focused, f.nodes["shop-toggle"]);
    ui.render({ ...purchased, coins: 0 }, "wheat", null);
    assert.equal(f.purchases[0].disabled, true);
    assert.equal(f.purchases[1].disabled, true);
  } finally {
    f.restore();
  }
});

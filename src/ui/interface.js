import { CROPS, SPRINKLER, FARM } from "../config/crops.js";
import { SHOP_ITEMS, MAX_STOCK } from "../config/shop.js";
import { HARVEST_BAG_CAPACITY, harvestBagCount, harvestBagValue } from "../config/harvest.js";
import { DEFAULT_BRIGHTNESS, normalizeBrightness } from "../game/settings.js";
import { growthProgress, nextExpansionCost, secondsRemaining, findPatchIndex, onLand, isSprinkler } from "../game/farm.js";

export function createInterface({
  onToolChange, onBuy, onSell, onReset, onExpand, onBrightnessChange, brightness = DEFAULT_BRIGHTNESS,
}) {
  const coinLabel = document.querySelector("#coins");
  const harvestLabel = document.querySelector("#harvested");
  const harvestCounter = document.querySelector("#harvest-counter");
  const bagCountLabel = document.querySelector("#bag-count");
  const sellButton = document.querySelector("#sell-harvest");
  const inspector = document.querySelector("#inspector");
  const plotDetail = document.querySelector("#plot-detail");
  const title = document.querySelector("#inspect-title");
  const detail = document.querySelector("#inspect-text");
  const progress = document.querySelector("#inspect-progress");
  const toast = document.querySelector("#toast");
  const expandButton = document.querySelector("#expand-farm");
  const buttons = Array.from(document.querySelectorAll("[data-tool]"));

  const settingsToggle = document.querySelector("#settings-toggle");
  const settingsPanel = document.querySelector("#settings-panel");
  const settingsClose = document.querySelector("#settings-close");
  const brightnessSlider = document.querySelector("#brightness");
  const brightnessValue = document.querySelector("#brightness-value");
  const brightnessReset = document.querySelector("#brightness-reset");

  const shopToggle = document.querySelector("#shop-toggle");
  const shopPanel = document.querySelector("#shop-panel");
  const shopClose = document.querySelector("#shop-close");
  const shopCoins = document.querySelector("#shop-coins");
  const shopTabs = Array.from(document.querySelectorAll("[data-shop-tab]"));
  const shopPanels = Array.from(document.querySelectorAll("[data-shop-panel]"));
  const shopBuyButtons = Array.from(document.querySelectorAll("[data-buy]"));
  let toastTimer;

  function displayBrightness(value) {
    const normalized = normalizeBrightness(value);
    brightnessSlider.value = String(normalized);
    brightnessValue.value = normalized + "%";
    brightnessValue.textContent = normalized + "%";
    return normalized;
  }
  displayBrightness(brightness);

  function setSettingsOpen(open) {
    if (open) setShopOpen(false);
    settingsPanel.hidden = !open;
    settingsToggle.setAttribute("aria-expanded", String(open));
    settingsToggle.setAttribute("aria-label", open ? "Close settings" : "Open settings");
    if (open) brightnessSlider.focus();
  }
  function selectShopTab(tab, focus = false) {
    for (const button of shopTabs) {
      const selected = button.dataset.shopTab === tab;
      button.setAttribute("aria-selected", String(selected));
      button.tabIndex = selected ? 0 : -1;
      if (selected && focus) button.focus();
    }
    for (const panel of shopPanels) panel.hidden = panel.dataset.shopPanel !== tab;
  }
  function setShopOpen(open) {
    if (open) setSettingsOpen(false);
    shopPanel.hidden = !open;
    shopToggle.setAttribute("aria-expanded", String(open));
    shopToggle.setAttribute("aria-label", open ? "Close shop" : "Open shop");
    if (open) {
      selectShopTab("seeds");
      shopTabs[0].focus();
    }
  }

  settingsToggle.addEventListener("click", () => setSettingsOpen(settingsPanel.hidden));
  settingsClose.addEventListener("click", () => {
    setSettingsOpen(false);
    settingsToggle.focus();
  });
  shopToggle.addEventListener("click", () => setShopOpen(shopPanel.hidden));
  shopClose.addEventListener("click", () => {
    setShopOpen(false);
    shopToggle.focus();
  });
  for (const tab of shopTabs) {
    tab.addEventListener("click", () => selectShopTab(tab.dataset.shopTab));
    tab.addEventListener("keydown", event => {
      if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
      event.preventDefault();
      const current = shopTabs.findIndex(button => button.getAttribute("aria-selected") === "true");
      const index = event.key === "Home" ? 0 : event.key === "End" ? shopTabs.length - 1 :
        (current + (event.key === "ArrowRight" ? 1 : -1) + shopTabs.length) % shopTabs.length;
      selectShopTab(shopTabs[index].dataset.shopTab, true);
    });
  }
  for (const button of shopBuyButtons) {
    const item = SHOP_ITEMS[button.dataset.buy];
    button.textContent = "Buy ✦ " + item.cost;
    button.addEventListener("click", () => onBuy(item.id));
  }
  brightnessSlider.addEventListener("input", () => onBrightnessChange(displayBrightness(brightnessSlider.value)));
  brightnessReset.addEventListener("click", () => onBrightnessChange(displayBrightness(DEFAULT_BRIGHTNESS)));
  document.addEventListener("pointerdown", event => {
    if (!settingsPanel.hidden && !settingsPanel.contains(event.target) &&
        !settingsToggle.contains(event.target)) setSettingsOpen(false);
    if (!shopPanel.hidden && !shopPanel.contains(event.target) &&
        !shopToggle.contains(event.target)) setShopOpen(false);
  });
  window.addEventListener("keydown", event => {
    if (event.key !== "Escape") return;
    if (!shopPanel.hidden) {
      setShopOpen(false);
      shopToggle.focus();
    } else if (!settingsPanel.hidden) {
      setSettingsOpen(false);
      settingsToggle.focus();
    }
  });

  for (const button of buttons) {
    button.addEventListener("click", () => onToolChange(button.dataset.tool));
    if (button.dataset.tool === "plot") button.querySelector(".tool-cost").textContent = "✦ " + FARM.patchCost;
  }
  expandButton.addEventListener("click", onExpand);
  sellButton.addEventListener("click", onSell);
  document.querySelector("#reset").addEventListener("click", () => {
    if (window.confirm("Reset farm? This erases your saved progress.")) onReset();
  });

  function notify(message) {
    if (!message) return;
    toast.textContent = message;
    toast.classList.add("visible");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove("visible"), 2300);
  }
  function render(state, tool, hovered, now = Date.now()) {
    coinLabel.textContent = state.coins;
    harvestLabel.textContent = state.harvested;
    const held = harvestBagCount(state.harvestBag);
    const value = harvestBagValue(state.harvestBag);
    bagCountLabel.textContent = held + "/" + HARVEST_BAG_CAPACITY;
    harvestCounter.classList.toggle("full", held === HARVEST_BAG_CAPACITY);
    harvestCounter.setAttribute("aria-label", "Harvest bag: " + held + " of " + HARVEST_BAG_CAPACITY + " crops");
    sellButton.disabled = held === 0;
    sellButton.textContent = held ? "Sell ✦ " + value : "Sell";
    sellButton.setAttribute("aria-label", held ? "Sell " + held + " harvested crops for " + value + " coins" : "Harvest bag empty");
    shopCoins.textContent = "✦ " + state.coins;
    for (const item of Object.values(SHOP_ITEMS)) {
      document.querySelector("#stock-" + item.id).textContent = state.inventory[item.id];
    }
    for (const button of shopBuyButtons) {
      const item = SHOP_ITEMS[button.dataset.buy];
      const enoughCoins = state.coins >= item.cost;
      const enoughSpace = state.inventory[item.id] <= MAX_STOCK - item.quantity;
      button.disabled = !enoughCoins || !enoughSpace;
      button.title = !enoughCoins ? "Not enough coins" : !enoughSpace ? "Inventory full" : "Buy " + item.name;
    }
    for (const button of buttons) {
      const id = button.dataset.tool;
      const active = id === tool;
      button.classList.toggle("selected", active);
      button.setAttribute("aria-pressed", String(active));
      if (id === "wheat" || id === "sprinkler") {
        button.querySelector(".tool-cost").textContent = "× " + state.inventory[id];
        button.title = state.inventory[id] ? (id === "wheat" ? "Click or drag over prepared soil · " : "In stock: ") + state.inventory[id] : "Out of stock · Buy in Shop";
      }
    }
    const expansionCost = nextExpansionCost(state);
    expandButton.hidden = expansionCost === null;
    if (expansionCost !== null) {
      expandButton.textContent = "↗ Expand land · ✦ " + expansionCost;
      expandButton.disabled = state.coins < expansionCost;
      expandButton.title = state.coins < expansionCost ? "Requires " + expansionCost + " coins" : "Expand farm land";
    }
    const showPoint = hovered !== null;
    plotDetail.hidden = !showPoint;
    inspector.hidden = !showPoint && expansionCost === null;
    if (!showPoint) return;
    if (!onLand(state, hovered, FARM.patchRadius)) {
      progress.parentElement.hidden = true;
      title.textContent = "Unowned land";
      detail.textContent = expansionCost === null ? "Farm fully expanded." : "Expand land · ✦ " + expansionCost;
      progress.style.width = "0%";
      return;
    }
    const index = findPatchIndex(state, hovered);
    if (index === -1) {
      progress.parentElement.hidden = true;
      title.textContent = "Grass";
      detail.textContent = tool === "plot"
        ? "Click and drag to paint soil · ✦ " + FARM.patchCost + " / dab"
        : "Use Plot (4) to paint soil.";
      progress.style.width = "0%";
      return;
    }
    const content = state.patches[index].content;
    if (!content) {
      progress.parentElement.hidden = true;
      title.textContent = "Prepared soil";
      detail.textContent = tool === "water" ? "Select Wheat (1)." :
        tool === SPRINKLER.id
          ? state.inventory.sprinkler ? "Place sprinkler · × " + state.inventory.sprinkler : "Buy a sprinkler in Shop → Buildings." :
        tool === "plot" ? "Already painted · Select Wheat (1)." :
        state.inventory.wheat ? "Click or drag to sow · × " + state.inventory.wheat + " seeds" : "Buy a wheat seed bag in Shop → Seeds.";
      progress.style.width = "0%";
      return;
    }
    if (isSprinkler(content)) {
      progress.parentElement.hidden = true;
      title.textContent = "💦 Sprinkler";
      detail.textContent = "Automatically waters nearby wheat.";
      progress.style.width = "0%";
      return;
    }
    progress.parentElement.hidden = false;
    const crop = CROPS[content.cropId];
    const remaining = secondsRemaining(content, now);
    title.textContent = crop.icon + " " + crop.name;
    detail.textContent = remaining === 0
      ? held >= HARVEST_BAG_CAPACITY ? "Bag full · Sell your harvest first" : "Ready to collect · Bag " + held + "/" + HARVEST_BAG_CAPACITY
      : remaining + "s remaining" + (content.watered ? " · 💧 watered" : " · 💧 speeds growth");
    progress.style.width = Math.round(growthProgress(content, now) * 100) + "%";
  }
  return { render, notify };
}

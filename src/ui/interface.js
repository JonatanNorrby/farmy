import { CROPS, SPRINKLER, FARM } from "../config/crops.js";
import { DEFAULT_BRIGHTNESS, normalizeBrightness } from "../game/settings.js";
import { growthProgress, nextExpansionCost, secondsRemaining, findPatchIndex, onLand, isSprinkler } from "../game/farm.js";

export function createInterface({ onToolChange, onReset, onExpand, onBrightnessChange, brightness = DEFAULT_BRIGHTNESS }) {
  const coinLabel = document.querySelector("#coins");
  const harvestLabel = document.querySelector("#harvested");
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
  function displayBrightness(value) {
    const normalized = normalizeBrightness(value);
    brightnessSlider.value = String(normalized);
    brightnessValue.value = normalized + "%";
    brightnessValue.textContent = normalized + "%";
    return normalized;
  }
  displayBrightness(brightness);
  function setSettingsOpen(open) {
    settingsPanel.hidden = !open;
    settingsToggle.setAttribute("aria-expanded", String(open));
    settingsToggle.setAttribute("aria-label", open ? "Close settings" : "Open settings");
    if (open) brightnessSlider.focus();
  }
  settingsToggle.addEventListener("click", () => setSettingsOpen(settingsPanel.hidden));
  settingsClose.addEventListener("click", () => {
    setSettingsOpen(false);
    settingsToggle.focus();
  });
  function changeBrightness(value) {
    onBrightnessChange(displayBrightness(value));
  }
  brightnessSlider.addEventListener("input", () => changeBrightness(brightnessSlider.value));
  brightnessReset.addEventListener("click", () => changeBrightness(DEFAULT_BRIGHTNESS));
  document.addEventListener("pointerdown", event => {
    if (!settingsPanel.hidden && !settingsPanel.contains(event.target) &&
        !settingsToggle.contains(event.target)) setSettingsOpen(false);
  });
  window.addEventListener("keydown", event => {
    if (event.key === "Escape" && !settingsPanel.hidden) {
      setSettingsOpen(false);
      settingsToggle.focus();
    }
  });
  let toastTimer;

  for (const button of buttons) {
    const id = button.dataset.tool;
    if (CROPS[id] || id === SPRINKLER.id || id === "plot") button.querySelector(".tool-cost").textContent = "✦ " + (id === "plot" ? FARM.patchCost : (CROPS[id] || SPRINKLER).cost);
    button.addEventListener("click", () => onToolChange(id));
  }
  expandButton.addEventListener("click", onExpand);
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

    const expansionCost = nextExpansionCost(state);
    expandButton.hidden = expansionCost === null;
    if (expansionCost !== null) {
      expandButton.textContent = "↗ Expand land · ✦ " + expansionCost;
      expandButton.disabled = state.coins < expansionCost;
      expandButton.title = state.coins < expansionCost
        ? "Requires " + expansionCost + " coins"
        : "Expand the underlying farm land";
    }
    for (const button of buttons) {
      const active = button.dataset.tool === tool;
      button.classList.toggle("selected", active);
      button.setAttribute("aria-pressed", String(active));
    }

    const showPoint = hovered !== null;
    plotDetail.hidden = !showPoint;
    inspector.hidden = !showPoint && expansionCost === null;
    if (!showPoint) return;

    if (!onLand(state, hovered, FARM.patchRadius)) {
      progress.parentElement.hidden = true;
      title.textContent = "Unowned land";
      detail.textContent = expansionCost === null ? "Farm fully expanded." :
        "Expand land · ✦ " + expansionCost;
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
        tool === SPRINKLER.id ? "Place sprinkler · ✦ " + SPRINKLER.cost :
        tool === "plot" ? "Already painted · Select Wheat (1)." :
        "Plant wheat · ✦ " + CROPS.wheat.cost;
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
      ? "Ready to harvest · +✦ " + crop.reward
      : remaining + "s remaining" + (content.watered ? " · 💧 watered" : " · 💧 speeds growth");
    progress.style.width = Math.round(growthProgress(content, now) * 100) + "%";
  }

  return { render, notify };
}

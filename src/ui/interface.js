import { CROPS, SPRINKLER } from "../config/crops.js";
import { growthProgress, nextExpansionCost, secondsRemaining, isPlotUnlocked, isSprinkler } from "../game/farm.js";

export function createInterface({ onToolChange, onReset, onExpand }) {
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
  let toastTimer;

  for (const button of buttons) {
    const id = button.dataset.tool;
    if (CROPS[id] || id === SPRINKLER.id) button.querySelector(".tool-cost").textContent = "✦ " + (CROPS[id] || SPRINKLER).cost;
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
      expandButton.textContent = "↗ +5 plots · ✦ " + expansionCost;
      expandButton.disabled = state.coins < expansionCost;
      expandButton.title = state.coins < expansionCost
        ? "Requires " + expansionCost + " coins"
        : "Unlock the next row";
    }
    for (const button of buttons) {
      const active = button.dataset.tool === tool;
      button.classList.toggle("selected", active);
      button.setAttribute("aria-pressed", String(active));
    }

    const showPlot = hovered !== null && hovered >= 0 && hovered < state.plots.length;
    plotDetail.hidden = !showPlot;
    inspector.hidden = !showPlot && expansionCost === null;
    if (!showPlot) return;

    if (!isPlotUnlocked(state, hovered)) {
      progress.parentElement.hidden = true;
      title.textContent = "Locked land";
      detail.textContent = "Unlock the next row to plant here.";
      progress.style.width = "0%";
      return;
    }
    const plot = state.plots[hovered];
    if (!plot) {
      progress.parentElement.hidden = true;
      title.textContent = "Empty plot";
      detail.textContent = tool === "water" ? "Select a seed." :
        tool === SPRINKLER.id ? "Place sprinkler · ✦ " + SPRINKLER.cost :
        "Plant " + CROPS[tool].name.toLowerCase() + " · ✦ " + CROPS[tool].cost;
      progress.style.width = "0%";
      return;
    }
    if (isSprinkler(plot)) {
      progress.parentElement.hidden = true;
      title.textContent = "💦 Sprinkler";
      detail.textContent = "Automatically waters up to 8 adjacent plots.";
      progress.style.width = "0%";
      return;
    }

    progress.parentElement.hidden = false;
    const crop = CROPS[plot.cropId];
    const remaining = secondsRemaining(plot, now);
    title.textContent = crop.icon + " " + crop.name;
    detail.textContent = remaining === 0
      ? "Ready to harvest · +✦ " + crop.reward
      : remaining + "s remaining" + (plot.watered ? " · 💧 watered" : " · 💧 speeds growth");
    progress.style.width = Math.round(growthProgress(plot, now) * 100) + "%";
  }

  return { render, notify };
}

import { CROPS } from "../config/crops.js";
import { growthProgress, nextExpansionCost, secondsRemaining, isPlotUnlocked } from "../game/farm.js";

export function createInterface({ onToolChange, onReset, onExpand }) {
  const coinLabel = document.querySelector("#coins");
  const harvestLabel = document.querySelector("#harvested");
  const title = document.querySelector("#inspect-title");
  const detail = document.querySelector("#inspect-text");
  const progress = document.querySelector("#inspect-progress");
  const toast = document.querySelector("#toast");
  const expandButton = document.querySelector("#expand-farm");
  const buttons = Array.from(document.querySelectorAll("[data-tool]"));
  let toastTimer;

  for (const button of buttons) {
    const id = button.dataset.tool;
    if (CROPS[id]) button.querySelector(".tool-cost").textContent = "✦ " + CROPS[id].cost;
    button.addEventListener("click", () => onToolChange(id));
  }
  expandButton.addEventListener("click", onExpand);
  document.querySelector("#reset").addEventListener("click", () => {
    if (window.confirm("Start a fresh garden? Your current plants and coins will be reset.")) onReset();
  });

  function notify(message) {
    toast.textContent = message;
    toast.classList.add("visible");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove("visible"), 2800);
  }

  function render(state, tool, hovered, now = Date.now()) {
    coinLabel.textContent = state.coins;
    harvestLabel.textContent = state.harvested;
    const expansionCost = nextExpansionCost(state);
    expandButton.hidden = expansionCost === null;
    if (expansionCost !== null) {
      expandButton.textContent = "↗ Unlock 5 plots · ✦ " + expansionCost;
      expandButton.disabled = state.coins < expansionCost;
      expandButton.title = state.coins < expansionCost ? "Save up " + expansionCost + " coins to expand" : "Clear the next row of your farm";
    }
    for (const button of buttons) {
      const active = button.dataset.tool === tool;
      button.classList.toggle("selected", active);
      button.setAttribute("aria-pressed", String(active));
    }
    if (hovered === null || hovered < 0 || hovered >= state.plots.length) {
      title.textContent = "Your garden awaits";
      detail.textContent = "Hover over or tap a garden plot to see what's happening.";
      progress.style.width = "0%";
      return;
    }
    if (!isPlotUnlocked(state, hovered)) {
      title.textContent = "🌿 Untilled meadow";
      detail.textContent = expansionCost === null ? "Your farm is fully expanded." :
        "Clear row " + (state.unlockedRows + 1) + " for ✦ " + expansionCost + " to open five more plots.";
      progress.style.width = "0%";
      return;
    }
    const plot = state.plots[hovered];
    if (!plot) {
      title.textContent = "An empty patch";
      detail.textContent = tool === "water" ? "Choose a seed first, then click this patch." : "Click here to plant your " + CROPS[tool].name.toLowerCase() + " seeds.";
      progress.style.width = "0%";
      return;
    }
    const crop = CROPS[plot.cropId];
    title.textContent = crop.icon + " " + crop.name;
    const remaining = secondsRemaining(plot, now);
    if (remaining === 0) {
      detail.textContent = "Ready to harvest! Click this patch to earn " + crop.reward + " coins.";
      progress.style.width = "100%";
    } else {
      detail.textContent = remaining + "s until harvest" + (plot.watered ? " · freshly watered 💧" : " · use the watering can to speed it up");
      progress.style.width = Math.round(growthProgress(plot, now) * 100) + "%";
    }
  }

  return { render, notify };
}

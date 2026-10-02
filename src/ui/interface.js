import { CROPS } from "../config/crops.js";
import { growthProgress, secondsRemaining } from "../game/farm.js";

export function createInterface({ onToolChange, onReset }) {
  const coinLabel = document.querySelector("#coins");
  const harvestLabel = document.querySelector("#harvested");
  const title = document.querySelector("#inspect-title");
  const detail = document.querySelector("#inspect-text");
  const progress = document.querySelector("#inspect-progress");
  const toast = document.querySelector("#toast");
  const buttons = Array.from(document.querySelectorAll("[data-tool]"));
  let toastTimer;

  for (const button of buttons) {
    const id = button.dataset.tool;
    if (CROPS[id]) button.querySelector(".tool-cost").textContent = "✦ " + CROPS[id].cost;
    button.addEventListener("click", () => onToolChange(id));
  }
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

import { CROPS, PLOT_COUNT } from "../config/crops.js";

export const SAVE_VERSION = 1;

export function newFarm() {
  return { version: SAVE_VERSION, coins: 64, harvested: 0, plots: Array(PLOT_COUNT).fill(null) };
}
function failure(state, message) { return { ok: false, state, message }; }
function validIndex(index) { return Number.isInteger(index) && index >= 0 && index < PLOT_COUNT; }
function withPlot(state, index, plot, extra = {}) {
  const plots = state.plots.slice();
  plots[index] = plot;
  return { ...state, plots, ...extra };
}

export function plant(state, index, cropId, now = Date.now()) {
  if (!validIndex(index)) return failure(state, "That patch isn't available.");
  const crop = CROPS[cropId];
  if (!crop) return failure(state, "Choose a seed first.");
  if (state.plots[index]) return failure(state, "This patch is already planted.");
  if (state.coins < crop.cost) return failure(state, "Not enough coins for those seeds.");
  return {
    ok: true,
    state: withPlot(state, index, { cropId, plantedAt: now, readyAt: now + crop.growMs, watered: false }, { coins: state.coins - crop.cost }),
    message: crop.icon + " " + crop.name + " planted. A little patience goes a long way!",
  };
}

export function water(state, index, now = Date.now()) {
  if (!validIndex(index)) return failure(state, "That patch isn't available.");
  const plot = state.plots[index];
  if (!plot) return failure(state, "Plant a seed here first.");
  if (now >= plot.readyAt) return failure(state, "This crop is ready to harvest!");
  if (plot.watered) return failure(state, "This crop has already had its drink.");
  const crop = CROPS[plot.cropId];
  const readyAt = Math.max(now + 2500, plot.readyAt - crop.growMs * 0.38);
  return {
    ok: true,
    state: withPlot(state, index, { ...plot, watered: true, readyAt }),
    message: "💧 A lovely drink! Your " + crop.name.toLowerCase() + " will grow faster.",
  };
}

export function harvest(state, index, now = Date.now()) {
  if (!validIndex(index)) return failure(state, "That patch isn't available.");
  const plot = state.plots[index];
  if (!plot) return failure(state, "Nothing to harvest just yet.");
  if (now < plot.readyAt) return failure(state, "Still growing. Give it a little more time!");
  const crop = CROPS[plot.cropId];
  return {
    ok: true,
    state: withPlot(state, index, null, { coins: state.coins + crop.reward, harvested: state.harvested + 1 }),
    message: crop.icon + " Harvested " + crop.name.toLowerCase() + "! +" + crop.reward + " coins",
  };
}

export function growthProgress(plot, now = Date.now()) {
  if (!plot) return 0;
  return Math.max(0, Math.min(1, (now - plot.plantedAt) / Math.max(1, plot.readyAt - plot.plantedAt)));
}

// -1 empty, 0 seedling, 1 sprout, 2 grown, 3 harvestable.
export function growthStage(plot, now = Date.now()) {
  if (!plot) return -1;
  const value = growthProgress(plot, now);
  return value >= 1 ? 3 : value < .25 ? 0 : value < .65 ? 1 : 2;
}

export function secondsRemaining(plot, now = Date.now()) {
  return plot ? Math.max(0, Math.ceil((plot.readyAt - now) / 1000)) : 0;
}

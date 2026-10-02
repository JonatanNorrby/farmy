import { CROPS, FARM, PLOT_COUNT, SPRINKLER, PLANTABLE_CROPS } from "../config/crops.js";

export const SAVE_VERSION = 3;

export function newFarm() {
  return { version: SAVE_VERSION, coins: 64, harvested: 0, unlockedRows: FARM.initialRows, plots: Array(PLOT_COUNT).fill(null) };
}
function failure(state, message) { return { ok: false, state, message }; }
function validIndex(index) { return Number.isInteger(index) && index >= 0 && index < PLOT_COUNT; }
export function unlockedPlotCount(state) { return state.unlockedRows * FARM.columns; }
export function isPlotUnlocked(state, index) {
  return validIndex(index) && index < unlockedPlotCount(state);
}
export function isSprinkler(plot) { return plot?.kind === "sprinkler"; }

// Offsets are calculated in two dimensions to avoid wrapping from the end of
// one row to the beginning of the next; works for edge and corner sprinklers.
export function neighboringPlots(index) {
  if (!validIndex(index)) return [];
  const row = Math.floor(index / FARM.columns);
  const col = index % FARM.columns;
  const result = [];
  for (let dr = -SPRINKLER.radius; dr <= SPRINKLER.radius; dr++) {
    for (let dc = -SPRINKLER.radius; dc <= SPRINKLER.radius; dc++) {
      if (dr === 0 && dc === 0) continue;
      const r = row + dr, c = col + dc;
      if (r >= 0 && r < FARM.rows && c >= 0 && c < FARM.columns) result.push(r * FARM.columns + c);
    }
  }
  return result;
}
export function coveredBySprinkler(state, index) {
  return isPlotUnlocked(state, index) &&
    neighboringPlots(index).some(neighbor => isPlotUnlocked(state, neighbor) && isSprinkler(state.plots[neighbor]));
}

// Share the same one-time watering reduction for manual and automatic watering.
function wateredCrop(plot, now) {
  if (!plot || isSprinkler(plot)) return null;
  const crop = CROPS[plot.cropId];
  if (!crop || plot.watered || now >= plot.readyAt) return null;
  return { ...plot, watered: true, readyAt: Math.max(now + 2500, plot.readyAt - crop.growMs * .38) };
}

export function nextExpansionCost(state) {
  return state.unlockedRows >= FARM.rows ? null : FARM.expansionCosts[state.unlockedRows - FARM.initialRows];
}
export function expandFarm(state) {
  const cost = nextExpansionCost(state);
  if (cost === null) return failure(state, "Farm fully expanded.");
  if (state.coins < cost) return failure(state, "Need ✦ " + cost + " to expand.");
  return {
    ok: true,
    state: { ...state, coins: state.coins - cost, unlockedRows: state.unlockedRows + 1 },
    message: "🌱 +5 plots unlocked",
  };
}
function withPlot(state, index, plot, extra = {}) {
  const plots = state.plots.slice();
  plots[index] = plot;
  return { ...state, plots, ...extra };
}

export function placeSprinkler(state, index, now = Date.now()) {
  if (!isPlotUnlocked(state, index)) return failure(state, "Unlock land first.");
  if (state.plots[index]) return failure(state, "Plot already occupied.");
  if (state.coins < SPRINKLER.cost) return failure(state, "Not enough coins.");
  const plots = state.plots.slice();
  plots[index] = { kind: "sprinkler" };
  const wateredIndices = [];
  for (const neighbor of neighboringPlots(index)) {
    if (!isPlotUnlocked(state, neighbor)) continue;
    const watered = wateredCrop(plots[neighbor], now);
    if (!watered) continue;
    plots[neighbor] = watered;
    wateredIndices.push(neighbor);
  }
  return {
    ok: true,
    state: { ...state, plots, coins: state.coins - SPRINKLER.cost },
    wateredIndices,
    message: "💦 Sprinkler placed" + (wateredIndices.length ? " · " + wateredIndices.length + " watered" : ""),
  };
}

export function plant(state, index, cropId, now = Date.now()) {
  if (!isPlotUnlocked(state, index)) return failure(state, "Unlock land first.");
  if (!PLANTABLE_CROPS.includes(cropId)) return failure(state, "Only wheat can be planted.");
  const crop = CROPS[cropId];
  if (state.plots[index]) return failure(state, "Plot already occupied.");
  if (state.coins < crop.cost) return failure(state, "Not enough coins.");
  const planted = { cropId, plantedAt: now, readyAt: now + crop.growMs, watered: false };
  const automatic = coveredBySprinkler(state, index) ? wateredCrop(planted, now) : null;
  return {
    ok: true,
    state: withPlot(state, index, automatic || planted, { coins: state.coins - crop.cost }),
    wateredIndices: automatic ? [index] : [],
    message: crop.icon + " " + crop.name + " planted" + (automatic ? " · 💧" : ""),
  };
}

export function water(state, index, now = Date.now()) {
  if (!isPlotUnlocked(state, index)) return failure(state, "Unlock land first.");
  const plot = state.plots[index];
  if (isSprinkler(plot)) return failure(state, "Sprinkler waters nearby crops.");
  if (!plot) return failure(state, "Plant a seed first.");
  if (now >= plot.readyAt) return failure(state, "Ready to harvest.");
  if (plot.watered) return failure(state, "Already watered.");
  return {
    ok: true,
    state: withPlot(state, index, wateredCrop(plot, now)),
    wateredIndices: [index],
    message: "💧 Watered",
  };
}

export function harvest(state, index, now = Date.now()) {
  if (!isPlotUnlocked(state, index)) return failure(state, "Unlock land first.");
  const plot = state.plots[index];
  if (isSprinkler(plot)) return failure(state, "Sprinkler occupies this plot.");
  if (!plot) return failure(state, "Nothing to harvest.");
  if (now < plot.readyAt) return failure(state, "Still growing.");
  const crop = CROPS[plot.cropId];
  return {
    ok: true,
    state: withPlot(state, index, null, { coins: state.coins + crop.reward, harvested: state.harvested + 1 }),
    message: crop.icon + " Harvested · +✦ " + crop.reward,
  };
}

export function growthProgress(plot, now = Date.now()) {
  if (!plot || isSprinkler(plot)) return 0;
  return Math.max(0, Math.min(1, (now - plot.plantedAt) / Math.max(1, plot.readyAt - plot.plantedAt)));
}

// -1 empty/structure, 0 seedling, 1 sprout, 2 grown, 3 harvestable.
export function growthStage(plot, now = Date.now()) {
  if (!plot || isSprinkler(plot)) return -1;
  const value = growthProgress(plot, now);
  return value >= 1 ? 3 : value < .25 ? 0 : value < .65 ? 1 : 2;
}

export function secondsRemaining(plot, now = Date.now()) {
  return plot && !isSprinkler(plot) ? Math.max(0, Math.ceil((plot.readyAt - now) / 1000)) : 0;
}

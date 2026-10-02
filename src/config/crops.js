// All crop tuning and plot geometry live here.
export const FARM = Object.freeze({
  columns: 5, rows: 4, initialRows: 2, expansionCosts: Object.freeze([85, 180]),
  firstX: -8.6, firstZ: -3.5, spacing: 2.2,
});
export const PLOT_COUNT = FARM.columns * FARM.rows;

// A sprinkler occupies one plot and covers the eight surrounding grid cells.
export const SPRINKLER = Object.freeze({ id: "sprinkler", name: "Sprinkler", cost: 36, radius: 1, icon: "💦" });

export const CROPS = Object.freeze({
  carrot: Object.freeze({ id: "carrot", name: "Carrot", icon: "🥕", cost: 4, reward: 12, growMs: 25000 }),
  wheat: Object.freeze({ id: "wheat", name: "Wheat", icon: "🌾", cost: 6, reward: 19, growMs: 42000 }),
  pumpkin: Object.freeze({ id: "pumpkin", name: "Pumpkin", icon: "🎃", cost: 9, reward: 30, growMs: 65000 }),
});

export function plotPosition(index) {
  return {
    x: FARM.firstX + (index % FARM.columns) * FARM.spacing,
    z: FARM.firstZ + Math.floor(index / FARM.columns) * FARM.spacing,
  };
}

// The active farm is continuous world-space ground, not a tile grid.
export const FARM = Object.freeze({
  minX: -9.65, maxX: 1.25, minZ: -4.55,
  initialLevel: 2, maxLevel: 4, levelDepth: 2.2,
  landMargin: 1.4, expansionCosts: Object.freeze([85, 180]),
  patchRadius: .59, brushSpacing: .78, interactRadius: .67,
  patchCost: 3, maxPatches: 256,
});
export function landBounds(level) {
  return { minX: FARM.minX, maxX: FARM.maxX, minZ: FARM.minZ,
    maxZ: FARM.minZ + level * FARM.levelDepth + FARM.landMargin };
}

// Only used when migrating v1-v4 grid-based browser saves.
export const LEGACY_GRID = Object.freeze({
  columns: 5, rows: 4, firstX: -8.6, firstZ: -3.5, spacing: 2.2,
});
export const LEGACY_PLOT_COUNT = LEGACY_GRID.columns * LEGACY_GRID.rows;
export function legacyPlotPosition(index) {
  return {
    x: LEGACY_GRID.firstX + (index % LEGACY_GRID.columns) * LEGACY_GRID.spacing,
    z: LEGACY_GRID.firstZ + Math.floor(index / LEGACY_GRID.columns) * LEGACY_GRID.spacing,
  };
}
export const STARTER_PATCHES = Object.freeze([0, 1, 5, 6].map(index => Object.freeze(legacyPlotPosition(index))));

export const SPRINKLER = Object.freeze({
  id: "sprinkler", name: "Sprinkler", cost: 36,
  // Former diagonal adjacency was about 3.11 world units.
  radius: 3.2, icon: "💦",
});
export const PLANTABLE_CROPS = Object.freeze(["wheat"]);
export const CROPS = Object.freeze({
  carrot: Object.freeze({ id: "carrot", name: "Carrot", icon: "🥕", cost: 4, reward: 12, growMs: 25000 }),
  wheat: Object.freeze({ id: "wheat", name: "Wheat", icon: "🌾", cost: 6, reward: 19, growMs: 42000 }),
  pumpkin: Object.freeze({ id: "pumpkin", name: "Pumpkin", icon: "🎃", cost: 9, reward: 30, growMs: 65000 }),
});

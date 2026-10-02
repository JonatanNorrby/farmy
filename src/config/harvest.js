import { CROPS } from "./crops.js";

// Harvests stay in the bag until sold, preserving individual crop values even
// for carrots and pumpkins left in older saves.
export const HARVEST_BAG_CAPACITY = 10;
export const EMPTY_HARVEST_BAG = Object.freeze(
  Object.fromEntries(Object.keys(CROPS).map(id => [id, 0])),
);

export function harvestBagCount(bag) {
  return Object.keys(CROPS).reduce((count, id) => count + bag[id], 0);
}
export function harvestBagValue(bag) {
  return Object.keys(CROPS).reduce((coins, id) => coins + bag[id] * CROPS[id].reward, 0);
}
export function validHarvestBag(bag) {
  return !!bag && typeof bag === "object" && !Array.isArray(bag) &&
    Object.keys(bag).length === Object.keys(CROPS).length &&
    Object.keys(CROPS).every(id => Number.isSafeInteger(bag[id]) &&
      bag[id] >= 0 && bag[id] <= HARVEST_BAG_CAPACITY) &&
    harvestBagCount(bag) <= HARVEST_BAG_CAPACITY;
}

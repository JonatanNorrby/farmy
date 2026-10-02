import { CROPS, FARM, SPRINKLER, PLANTABLE_CROPS, STARTER_PATCHES, landBounds } from "../config/crops.js";
import { INITIAL_STOCK, MAX_STOCK, SHOP_ITEMS } from "../config/shop.js";

export const SAVE_VERSION = 6;
export const roundPosition = value => Math.round(value * 100) / 100;

export function newFarm() {
  return {
    version: SAVE_VERSION, coins: 64, harvested: 0, landLevel: FARM.initialLevel,
    inventory: { ...INITIAL_STOCK },
    patches: STARTER_PATCHES.map(({ x, z }) => ({ x, z, content: null })),
  };
}
const failure = (state, message) => ({ ok: false, state, message });
const validIndex = (state, index) => Number.isInteger(index) && index >= 0 && index < state.patches.length;
const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
export const isSprinkler = content => content?.kind === "sprinkler";

// Purchases happen in the shop, not when the player clicks farmland.
export function buyShopItem(state, id) {
  const item = Object.hasOwn(SHOP_ITEMS, id) ? SHOP_ITEMS[id] : null;
  if (!item) return failure(state, "Unknown shop item.");
  if (state.coins < item.cost) return failure(state, "Not enough coins.");
  if (state.inventory[id] > MAX_STOCK - item.quantity) return failure(state, "Storage is full.");
  return {
    ok: true,
    state: {
      ...state, coins: state.coins - item.cost,
      inventory: { ...state.inventory, [id]: state.inventory[id] + item.quantity },
    },
    message: item.icon + " Purchased " + item.name + " · +" + item.quantity,
  };
}

export function onLand(state, point, inset = 0) {
  if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.z)) return false;
  const b = landBounds(state.landLevel);
  return point.x >= b.minX + inset && point.x <= b.maxX - inset &&
    point.z >= b.minZ + inset && point.z <= b.maxZ - inset;
}
export function findPatchIndex(state, point, maxDistance = FARM.interactRadius) {
  if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.z)) return -1;
  let match = -1, nearest = maxDistance;
  for (let index = 0; index < state.patches.length; index++) {
    const d = distance(point, state.patches[index]);
    if (d <= nearest) { nearest = d; match = index; }
  }
  return match;
}
export function nextExpansionCost(state) {
  return state.landLevel >= FARM.maxLevel ? null :
    FARM.expansionCosts[state.landLevel - FARM.initialLevel];
}
export function expandFarm(state) {
  const cost = nextExpansionCost(state);
  if (cost === null) return failure(state, "Farm fully expanded.");
  if (state.coins < cost) return failure(state, "Need ✦ " + cost + " to expand.");
  return {
    ok: true, state: { ...state, coins: state.coins - cost, landLevel: state.landLevel + 1 },
    message: "🌿 More land unlocked",
  };
}
export function createPlot(state, point) {
  const stamp = point && { x: roundPosition(point.x), z: roundPosition(point.z) };
  if (!onLand(state, stamp, FARM.patchRadius)) return failure(state, "Expand land first.");
  if (state.patches.length >= FARM.maxPatches) return failure(state, "Farm is full.");
  if (findPatchIndex(state, stamp, FARM.brushSpacing) !== -1) return failure(state, "Already prepared.");
  if (state.coins < FARM.patchCost) return failure(state, "Need ✦ " + FARM.patchCost + " for soil.");
  const patch = { ...stamp, content: null };
  return {
    ok: true,
    state: { ...state, coins: state.coins - FARM.patchCost, patches: [...state.patches, patch] },
    changedIndices: [state.patches.length],
    message: "🌱 Soil painted",
  };
}

// A stroke samples its full line, so fast pointer movement cannot leave
// visible holes. Repeat samples over existing soil are free and idempotent.
export function paintSoil(state, from, to) {
  if (![from, to].every(p => p && Number.isFinite(p.x) && Number.isFinite(p.z)))
    return failure(state, "Point at the farm.");
  const length = distance(from, to);
  const segments = Math.max(1, Math.ceil(length / (FARM.brushSpacing * .42)));
  let next = state;
  const changedIndices = [];
  let reason = "";
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const point = { x: from.x + (to.x - from.x) * t, z: from.z + (to.z - from.z) * t };
    const result = createPlot(next, point);
    if (result.ok) {
      next = result.state;
      changedIndices.push(...result.changedIndices);
    } else if (result.message !== "Already prepared.") {
      reason = result.message;
      if (reason === "Farm is full." || reason.startsWith("Need ✦")) break;
    }
  }
  return changedIndices.length
    ? { ok: true, state: next, changedIndices, message: "🌱 Soil painted · " + changedIndices.length }
    : failure(state, reason || "Already prepared.");
}
function withContent(state, index, content, extra = {}) {
  const patches = state.patches.slice();
  patches[index] = { ...patches[index], content };
  return { ...state, patches, ...extra };
}
export function nearbySprinkler(state, index) {
  if (!validIndex(state, index)) return -1;
  return state.patches.findIndex((patch, other) =>
    other !== index && isSprinkler(patch.content) &&
    distance(patch, state.patches[index]) <= SPRINKLER.radius);
}
export function coveredBySprinkler(state, index) {
  return nearbySprinkler(state, index) !== -1;
}
function wateredCrop(content, now) {
  if (!content || isSprinkler(content)) return null;
  const crop = CROPS[content.cropId];
  if (!crop || content.watered || now >= content.readyAt) return null;
  return { ...content, watered: true, readyAt: Math.max(now + 2500, content.readyAt - crop.growMs * .38) };
}
export function placeSprinkler(state, index, now = Date.now()) {
  if (!validIndex(state, index)) return failure(state, "Paint soil first.");
  if (state.patches[index].content) return failure(state, "Soil already occupied.");
  if (state.inventory.sprinkler < 1) return failure(state, "Buy a sprinkler in Shop → Buildings.");
  let next = withContent(state, index, { kind: "sprinkler" }, {
    inventory: { ...state.inventory, sprinkler: state.inventory.sprinkler - 1 },
  });
  const wateredIndices = [];
  for (let other = 0; other < next.patches.length; other++) {
    if (other === index || distance(next.patches[index], next.patches[other]) > SPRINKLER.radius) continue;
    const watered = wateredCrop(next.patches[other].content, now);
    if (watered) {
      next = withContent(next, other, watered);
      wateredIndices.push(other);
    }
  }
  return {
    ok: true, state: next, wateredIndices,
    message: "💦 Sprinkler placed" + (wateredIndices.length ? " · " + wateredIndices.length + " watered" : ""),
  };
}
export function plant(state, index, cropId, now = Date.now()) {
  if (!validIndex(state, index)) return failure(state, "Paint soil first.");
  if (!PLANTABLE_CROPS.includes(cropId)) return failure(state, "Only wheat can be planted.");
  if (state.patches[index].content) return failure(state, "Soil already occupied.");
  const crop = CROPS[cropId];
  if (state.inventory.wheat < 1) return failure(state, "Buy wheat seed bags in Shop → Seeds.");
  const planted = { cropId, plantedAt: now, readyAt: now + crop.growMs, watered: false };
  const automatic = coveredBySprinkler(state, index) ? wateredCrop(planted, now) : null;
  return {
    ok: true, state: withContent(state, index, automatic || planted, {
      inventory: { ...state.inventory, wheat: state.inventory.wheat - 1 },
    }),
    wateredIndices: automatic ? [index] : [],
    message: crop.icon + " " + crop.name + " planted" + (automatic ? " · 💧" : ""),
  };
}
// Stroke-based planting over prepared soil. Intersect each soil center with the
// dragged world-space segment rather than relying on pointermove event density.
// A seed is spent exactly once per newly planted patch; occupied patches and
// sprinklers are skipped. Candidates are visited in the direction of travel so
// a nearly empty bag runs out where the stroke reaches them, not array order.
export function paintSeeds(state, from, to, cropId = "wheat", now = Date.now()) {
  if (![from, to].every(point =>
    point && Number.isFinite(point.x) && Number.isFinite(point.z)))
    return failure(state, "Point at prepared soil.");
  if (!PLANTABLE_CROPS.includes(cropId)) return failure(state, "Only wheat can be planted.");
  if (state.inventory.wheat < 1) return failure(state, "Seed bag empty · Shop → Seeds.");

  const dx = to.x - from.x, dz = to.z - from.z;
  const lengthSquared = dx * dx + dz * dz;
  const radiusSquared = FARM.seedBrushRadius * FARM.seedBrushRadius;
  const candidates = [];
  for (let index = 0; index < state.patches.length; index++) {
    const patch = state.patches[index];
    if (patch.content !== null) continue;
    const t = lengthSquared === 0 ? 0 : Math.max(0, Math.min(1,
      ((patch.x - from.x) * dx + (patch.z - from.z) * dz) / lengthSquared));
    const px = from.x + t * dx, pz = from.z + t * dz;
    const distanceSquared = (patch.x - px) ** 2 + (patch.z - pz) ** 2;
    if (distanceSquared <= radiusSquared) candidates.push({ index, t, distanceSquared });
  }
  candidates.sort((a, b) =>
    a.t - b.t || a.distanceSquared - b.distanceSquared || a.index - b.index);
  if (!candidates.length) return failure(state, "No empty soil in brush.");

  let next = state;
  const plantedIndices = [], wateredIndices = [];
  for (const { index } of candidates) {
    if (next.inventory.wheat === 0) break;
    const planted = plant(next, index, cropId, now);
    if (!planted.ok) continue;
    next = planted.state;
    plantedIndices.push(index);
    wateredIndices.push(...(planted.wateredIndices ?? []));
  }
  if (!plantedIndices.length) return failure(state, "Seed bag empty · Shop → Seeds.");
  return {
    ok: true, state: next, plantedIndices, wateredIndices,
    message: "🌾 Painted " + plantedIndices.length + " seed" +
      (plantedIndices.length === 1 ? "" : "s") +
      (next.inventory.wheat === 0 ? " · Bag empty" : ""),
  };
}

export function water(state, index, now = Date.now()) {
  if (!validIndex(state, index)) return failure(state, "Paint soil first.");
  const content = state.patches[index].content;
  if (isSprinkler(content)) return failure(state, "Sprinkler waters nearby crops.");
  if (!content) return failure(state, "Plant a seed first.");
  if (now >= content.readyAt) return failure(state, "Ready to harvest.");
  if (content.watered) return failure(state, "Already watered.");
  return {
    ok: true, state: withContent(state, index, wateredCrop(content, now)),
    wateredIndices: [index], message: "💧 Watered",
  };
}
export function harvest(state, index, now = Date.now()) {
  if (!validIndex(state, index)) return failure(state, "Paint soil first.");
  const content = state.patches[index].content;
  if (isSprinkler(content)) return failure(state, "Sprinkler occupies this spot.");
  if (!content) return failure(state, "Nothing to harvest.");
  if (now < content.readyAt) return failure(state, "Still growing.");
  return {
    ok: true,
    state: withContent(state, index, null, {
      coins: state.coins + CROPS[content.cropId].reward, harvested: state.harvested + 1,
    }),
    message: CROPS[content.cropId].icon + " Harvested · +✦ " + CROPS[content.cropId].reward,
  };
}
export function growthProgress(content, now = Date.now()) {
  if (!content || isSprinkler(content)) return 0;
  return Math.max(0, Math.min(1, (now - content.plantedAt) / Math.max(1, content.readyAt - content.plantedAt)));
}
export function growthStage(content, now = Date.now()) {
  if (!content || isSprinkler(content)) return -1;
  const value = growthProgress(content, now);
  return value >= 1 ? 3 : value < .25 ? 0 : value < .65 ? 1 : 2;
}
export function secondsRemaining(content, now = Date.now()) {
  return content && !isSprinkler(content) ? Math.max(0, Math.ceil((content.readyAt - now) / 1000)) : 0;
}

// Shop offers, inventory capacity and initial supplies live in one place.
// Buying adds to inventory; planting/placement later consumes that stock.
export const MAX_STOCK = 9999;
export const INITIAL_STOCK = Object.freeze({ wheat: 0, sprinkler: 0 });
export const LEGACY_STARTER_STOCK = Object.freeze({ wheat: 10, sprinkler: 0 });

export const SHOP_ITEMS = Object.freeze({
  wheat: Object.freeze({
    id: "wheat", tab: "seeds", name: "Wheat seed bag", icon: "🌾",
    cost: 30, quantity: 10, description: "10 wheat seeds · one seed per plant",
  }),
  sprinkler: Object.freeze({
    id: "sprinkler", tab: "buildings", name: "Sprinkler", icon: "💦",
    cost: 36, quantity: 1, description: "Buy now, place on empty painted soil",
  }),
});

export function validStock(stock) {
  return !!stock && !Array.isArray(stock) &&
    Object.keys(stock).length === Object.keys(INITIAL_STOCK).length &&
    Object.keys(INITIAL_STOCK).every(key =>
      Number.isSafeInteger(stock[key]) && stock[key] >= 0 && stock[key] <= MAX_STOCK);
}

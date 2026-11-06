// Pricing rule shared with the backend:
//   unit price = (base price + flavor extra) * portions in the package + package adjustment
// A negative package adjustment works as a box discount.

export type PricingOption = {
  priceDelta: number;
  portions: number;
};

export function unitPrice(basePrice: number, flavor: PricingOption | null, pack: PricingOption | null): number {
  const portions = pack?.portions ?? 1;
  return (basePrice + (flavor?.priceDelta ?? 0)) * portions + (pack?.priceDelta ?? 0);
}

export function portionsPerUnit(pack: PricingOption | null): number {
  return pack?.portions ?? 1;
}

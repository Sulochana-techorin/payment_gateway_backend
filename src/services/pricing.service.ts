import { getPricingConfig as readPricingConfig } from "../config/pricing";

export function getPricingConfig() {
  const { basePrice, pricePerUser, currency } = readPricingConfig();

  return {
    basePrice,
    pricePerUser,
    currency,
  };
}

export function calculatePricing(users: number) {
  const { basePrice, pricePerUser, currency } = readPricingConfig();
  const total = basePrice + users * pricePerUser;

  return {
    users,
    total,
    currency,
  };
}

export interface PricingConfig {
  basePrice: number;
  pricePerUser: number;
  currency: string;
}

function getRequiredEnv(name: string): string {
  const value = process.env[name];

  if (!value || value.trim() === "") {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

function parseRequiredNumber(name: string): number {
  const value = getRequiredEnv(name);
  const parsed = Number.parseFloat(value);

  if (Number.isNaN(parsed)) {
    throw new Error(`Invalid numeric environment variable: ${name}=${value}`);
  }

  return parsed;
}

export function getPricingConfig(): PricingConfig {
  return {
    basePrice: parseRequiredNumber("BASE_PRICE"),
    pricePerUser: parseRequiredNumber("PRICE_PER_USER"),
    currency: getRequiredEnv("CURRENCY"),
  };
}
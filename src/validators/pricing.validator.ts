import { parseInteger } from "./schema";

export interface CalculatePricingQuery {
  users: unknown;
}

export function validateCalculatePricingQuery(query: CalculatePricingQuery): string | null {
  const users = parseInteger(query.users);

  if (Number.isNaN(users)) {
    return "Invalid user count";
  }

  if (users < 0) {
    return "User count cannot be negative";
  }

  return null;
}

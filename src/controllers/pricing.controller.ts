import { Request, Response } from "express";

import { calculatePricing, getPricingConfig } from "../services/pricing.service";
import { parseInteger } from "../validators/schema";

export function getPricing(_req: Request, res: Response) {
  res.json(getPricingConfig());
}

export function calculatePrice(req: Request, res: Response) {
  const users = parseInteger(req.query.users);

  res.json(calculatePricing(users));
}

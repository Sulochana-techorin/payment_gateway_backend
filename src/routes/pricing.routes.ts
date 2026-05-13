import { Router } from "express";

import { calculatePrice, getPricing } from "../controllers/pricing.controller";
import { validateRequest } from "../middleware/validation";
import { asyncHandler } from "../middleware/asyncHandler";
import { CalculatePricingQuery, validateCalculatePricingQuery } from "../validators/pricing.validator";

const pricingRouter = Router();

pricingRouter.get("/pricing", getPricing);
pricingRouter.get(
	"/api/pricing/calculate",
	validateRequest<CalculatePricingQuery>(
		validateCalculatePricingQuery,
		(req) => ({ users: req.query.users }),
	),
	asyncHandler(calculatePrice),
);

export { pricingRouter };

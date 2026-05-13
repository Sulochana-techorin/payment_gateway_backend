import { Router } from "express";

import { createOrder, getOrder, cancelOrder } from "../controllers/order.controller";
import { validateRequest } from "../middleware/validation";
import { asyncHandler } from "../middleware/asyncHandler";
import { CreateOrderPayload, validateCreateOrderPayload } from "../validators/order.validator";
import { requireBody } from "../validators/schema";

const orderRouter = Router();

orderRouter.post(
	"/api/order/create",
	validateRequest<CreateOrderPayload>(validateCreateOrderPayload, (req) => requireBody<CreateOrderPayload>(req)),
	asyncHandler(createOrder),
);
orderRouter.get("/api/order/:id", asyncHandler(getOrder));
orderRouter.post("/api/order/cancel", asyncHandler(cancelOrder));

export { orderRouter };

import { Router } from "express";

import {
  confirmPaymentSuccess,
  confirmPaymentFromReturn,
  createPayment,
  handlePayHereNotify,
  generateInvoice,
} from "../controllers/payment.controller";
import { validateRequest } from "../middleware/validation";
import { asyncHandler } from "../middleware/asyncHandler";
import { requireBody } from "../validators/schema";
import {
  InitiatePaymentPayload,
  validateInitiatePaymentPayload,
} from "../validators/payment.validator";

const paymentRouter = Router();

paymentRouter.post(
  "/api/payment/initiate",
  validateRequest<InitiatePaymentPayload>(
    validateInitiatePaymentPayload,
    (req) => requireBody<InitiatePaymentPayload>(req),
  ),
  asyncHandler(createPayment),
);

paymentRouter.post("/api/payment/notify", asyncHandler(handlePayHereNotify));
paymentRouter.post("/api/payment/confirm", asyncHandler(confirmPaymentFromReturn));
paymentRouter.post("/api/payment/confirm-success", asyncHandler(confirmPaymentSuccess));

paymentRouter.get(
  "/api/payment/invoice/:orderId",
  asyncHandler(generateInvoice)
);

export { paymentRouter };

import { Router } from "express";

import { getProfile, updateProfile, getSubscription, updateCard, confirmCardUpdate, cancelSubscription } from "../controllers/user.controller";
import { requireAuth } from "../middleware/authMiddleware";
import { asyncHandler } from "../middleware/asyncHandler";
import { validateRequest } from "../middleware/validation";
import { UpdateProfilePayload, validateUpdateProfilePayload } from "../validators/user.validator";
import { requireBody } from "../validators/schema";

const userRouter = Router();

// All user routes require authentication
userRouter.get(
  "/api/user/profile",
  requireAuth,
  asyncHandler(getProfile),
);

userRouter.put(
  "/api/user/profile",
  requireAuth,
  validateRequest<UpdateProfilePayload>(validateUpdateProfilePayload, (req) => requireBody<UpdateProfilePayload>(req)),
  asyncHandler(updateProfile),
);

userRouter.get(
  "/api/user/subscription",
  requireAuth,
  asyncHandler(getSubscription),
);

userRouter.post(
  "/api/user/update-card",
  requireAuth,
  asyncHandler(updateCard),
);

// Called by frontend when user returns from PayHere after card update
// Sends the card update email directly (fallback for when PayHere notify doesn't reach us)
userRouter.post(
  "/api/user/confirm-card-update",
  requireAuth,
  asyncHandler(confirmCardUpdate),
);

userRouter.post(
  "/api/user/cancel-subscription",
  requireAuth,
  asyncHandler(cancelSubscription),
);

export { userRouter };

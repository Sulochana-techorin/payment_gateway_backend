import { Router } from "express";

import { register, login } from "../controllers/auth.controller";
import { validateRequest } from "../middleware/validation";
import { asyncHandler } from "../middleware/asyncHandler";
import { RegisterPayload, validateRegisterPayload } from "../validators/auth.validator";
import { LoginPayload, validateLoginPayload } from "../validators/user.validator";
import { requireBody } from "../validators/schema";

const authRouter = Router();

authRouter.post(
	"/register",
	validateRequest<RegisterPayload>(validateRegisterPayload, (req) => requireBody<RegisterPayload>(req)),
	asyncHandler(register),
);

authRouter.post(
	"/login",
	validateRequest<LoginPayload>(validateLoginPayload, (req) => requireBody<LoginPayload>(req)),
	asyncHandler(login),
);

export { authRouter };

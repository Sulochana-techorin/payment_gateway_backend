import { Request, Response } from "express";

import { registerUser, loginUser } from "../services/auth.service";
import { RegisterPayload } from "../validators/auth.validator";
import { LoginPayload } from "../validators/user.validator";
import { requireBody } from "../validators/schema";

export async function register(req: Request, res: Response) {
  const payload = requireBody<RegisterPayload>(req);
  const result = await registerUser(payload);

  res.status(201).json({
    message: "User registered successfully",
    userId: result.userId,
  });
}

export async function login(req: Request, res: Response) {
  const payload = requireBody<LoginPayload>(req);
  const result = await loginUser(payload);

  res.json({
    message: "Login successful",
    token: result.token,
    userId: result.userId,
    name: result.name,
    email: result.email,
  });
}

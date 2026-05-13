import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

import { ApiError } from "./errorHandler";

export interface AuthPayload {
  userId: number;
  email: string;
}

export interface AuthenticatedRequest extends Request {
  user?: AuthPayload;
}

function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;

  if (!secret || secret.trim() === "") {
    throw new ApiError(500, "Missing required environment variable: JWT_SECRET");
  }

  return secret.trim();
}

export function generateToken(payload: AuthPayload): string {
  const secret = getJwtSecret();
  return jwt.sign(payload, secret, { expiresIn: "24h" });
}

export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    throw new ApiError(401, "Authentication required");
  }

  const token = authHeader.split(" ")[1];

  try {
    const secret = getJwtSecret();
    const decoded = jwt.verify(token, secret) as AuthPayload;

    (req as AuthenticatedRequest).user = decoded;
    next();
  } catch {
    throw new ApiError(401, "Invalid or expired token");
  }
}

import { Request } from "express";

export function parseInteger(value: unknown): number {
  if (typeof value === "number") {
    return Math.trunc(value);
  }

  if (typeof value === "string") {
    return Number.parseInt(value, 10);
  }

  return Number.NaN;
}

export function requireBody<T>(req: Request): T {
  return req.body as T;
}

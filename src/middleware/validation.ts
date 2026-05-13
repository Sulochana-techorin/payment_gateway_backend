import { Request, Response, NextFunction } from "express";

export function validateRequest<T>(
  validator: (payload: T) => string | null,
  getPayload: (req: Request) => T,
) {
  return (req: Request, res: Response, next: NextFunction) => {
    const payload = getPayload(req);
    const validationError = validator(payload);

    if (validationError) {
      res.status(400).json({ message: validationError });
      return;
    }

    next();
  };
}

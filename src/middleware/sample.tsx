import { Request, Response, NextFunction } from "express";

export function Logger(req: Request, res: Response, next: NextFunction) {
  const start = Date.now();

  res.on("finish", () => {
    const durationMs = Date.now() - start;
    console.log(
      `[${new Date().toISOString()}] ${req.method} ${req.path} - ${res.statusCode} (${durationMs}ms)`,
    );
  });

  next();
}

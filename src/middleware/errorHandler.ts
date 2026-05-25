import { NextFunction, Request, Response } from "express";

export class ApiError extends Error {
  public readonly statusCode: number;

  constructor(statusCode: number, message: string) {
    super(message);
    this.statusCode = statusCode;
    console.error(`API Error: ${statusCode} - ${message}`);
  }
}

export function notFoundHandler(req: Request, res: Response) {
  res.status(404).json({ message: `Route not found: ${req.method} ${req.originalUrl}` });
}

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
) {
  const isProduction = process.env.NODE_ENV === "production";

  if (err instanceof ApiError) {
    const message = err.message;
    res.status(err.statusCode).json({
      message,
      error: {
        status: err.statusCode,
        message,
      },
    });
    return;
  }

  if (err instanceof Error) {
    const status = 500;
    const message = isProduction ? "Internal server error" : err.message || "Server error";

    console.error("Unhandled error:", err);
    res.status(status).json({
      message,
      error: {
        status,
        message,
        ...(isProduction ? {} : { stack: err.stack }),
      },
    });
    return;
  }

  console.error("Unknown error:", err);
  const status = 500;
  const message = "Server error";
  res.status(status).json({
    message,
    error: {
      status,
      message,
    },
  });
}

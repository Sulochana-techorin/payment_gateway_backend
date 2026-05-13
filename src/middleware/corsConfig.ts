import { CorsOptions } from "cors";
import { env } from "../config/environments";

export const corsConfig: CorsOptions = {
  origin: (origin, callback) => {
    // Allow non-browser requests (no Origin header), e.g. server-to-server and health checks.
    if (!origin) {
      callback(null, true);
      return;
    }

    if (env.allowedOrigins.includes(origin)) {
      callback(null, true);
      return;
    }

    callback(new Error("Not allowed by CORS"));
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
};

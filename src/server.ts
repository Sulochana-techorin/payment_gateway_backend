import path from "path";
import dotenv from "dotenv";

dotenv.config({ path: path.resolve(__dirname, "../.env") });

import { createApp } from "./app";
import { initializeDatabase } from "./config/database";
import { env } from "./config/environments";

async function startServer() {
  try {
    await initializeDatabase();

    const app = createApp();

    app.listen(env.port, () => {
      console.log(`Server running on port ${env.port}`);
    });
  } catch (err) {
    console.error("Startup error:", err);
    process.exit(1);
  }
}

void startServer();
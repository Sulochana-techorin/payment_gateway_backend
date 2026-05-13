import { AppDataSource } from "./data-source";

export async function initializeDatabase() {
  if (AppDataSource.isInitialized) {
    return;
  }

  await AppDataSource.initialize();
  console.log("Database connected");
}

import "reflect-metadata";
import { DataSource } from "typeorm";
import dotenv from "dotenv";
import { User } from "../entity/user";
import { Order } from "../entity/order";
import { Subscription } from "../entity/subscription";
import { ProcessedWebhook } from "../entity/processed-webhook";
import { WebhookLog } from "../entity/webhook-log";
import path from "path";

dotenv.config();

// Railway provides DATABASE_URL or DATABASE_PUBLIC_URL as a single connection string.
// For local development, individual DB_* env vars are used.
const databaseUrl = process.env.DATABASE_URL || process.env.DATABASE_PUBLIC_URL;

const connectionOptions: any = databaseUrl
  ? {
      type: "postgres" as const,
      url: databaseUrl,
      ssl: { rejectUnauthorized: false },
    }
  : {
      type: "postgres" as const,
      host: process.env.DB_HOST!,
      port: parseInt(process.env.DB_PORT!),
      username: process.env.DB_USER!,
      password: process.env.DB_PASSWORD!,
      database: process.env.DB_NAME!,
    };

export const AppDataSource = new DataSource({
  ...connectionOptions,

  synchronize: false,
  logging: true,

  entities: [User, Order, Subscription, ProcessedWebhook, WebhookLog],
  migrations: [path.join(__dirname, "../migrations/*.{ts,js}")],
});
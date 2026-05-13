import "reflect-metadata";
import { DataSource } from "typeorm";
import dotenv from "dotenv";
import { User } from "../entity/user";
import { Order } from "../entity/order";
import { Subscription } from "../entity/subscription";
import path from "path";

dotenv.config();

export const AppDataSource = new DataSource({
  type: "postgres",
  host: process.env.DB_HOST!,
  port: parseInt(process.env.DB_PORT!),
  username: process.env.DB_USER!,
  password: process.env.DB_PASSWORD!,
  database: process.env.DB_NAME!,

  synchronize: false,
  logging: true,

  entities: [User, Order, Subscription],
  migrations: [path.join(__dirname, "../migrations/*.{ts,js}")],
});
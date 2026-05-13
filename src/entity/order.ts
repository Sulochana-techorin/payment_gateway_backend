import { EntitySchema } from "typeorm";

type OrderType = {
  id: string;
  user_id: number;
  user_count: number;
  base_price: number;
  price_per_user: number;
  subscription_amount: number;
  total_amount: number;
  status: string;
  invoice_path?: string | null;
  currency: string;
  payhere_subscription_id?: string | null;
  card_updated_at?: Date | null;
};

const decimalTransformer = {
  to: (value: number): number => value,
  from: (value: string | number): number =>
    typeof value === "number" ? value : parseFloat(value),
};

export const Order = new EntitySchema<OrderType>({
  name: "Order",
  tableName: "orders",

  columns: {
    id: {
      primary: true,
      type: "uuid",
      generated: "uuid",
    },

    user_id: {
      type: "int",
      nullable: false,
    },

    user_count: {
      type: "int",
      nullable: false,
    },

    base_price: {
      type: "numeric",
      precision: 14,
      scale: 6,
      transformer: decimalTransformer,
      nullable: false,
    },

    price_per_user: {
      type: "numeric",
      precision: 14,
      scale: 6,
      transformer: decimalTransformer,
      nullable: false,
    },

    subscription_amount: {
      type: "numeric",
      precision: 14,
      scale: 6,
      transformer: decimalTransformer,
      nullable: false,
    },

    total_amount: {
      type: "numeric",
      precision: 14,
      scale: 6,
      transformer: decimalTransformer,
      nullable: false,
    },

    status: {
      type: "varchar",
      length: 20,
      default: "PENDING",
    },

    invoice_path: {
      type: "varchar",
      nullable: true,
    },

    currency: {
      type: "varchar",
      length: 10,
      default: "USD",
    },

    payhere_subscription_id: {
      type: "varchar",
      nullable: true,
    },
    card_updated_at: {
      type: "timestamp",
      nullable: true,
    },
  },
});
import { EntitySchema } from "typeorm";

export const Subscription = new EntitySchema({
  name: "Subscription",
  tableName: "subscriptions",

  columns: {
    id: {
      primary: true,
      type: "uuid",
      generated: "uuid",
    },

    user_id: {
      type: "int",
    },

    order_id: {
      type: "uuid",
    },

    start_date: {
      type: "timestamp",
      createDate: true,
    },

    end_date: {
      type: "timestamp",
    },

    status: {
      type: "varchar",
      default: "ACTIVE",
    },
  },
});
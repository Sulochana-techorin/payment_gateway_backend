import { EntitySchema } from "typeorm";

type ProcessedWebhookType = {
  id: number;
  payment_id: string;
  order_id: string;
  status_code: string;
  charge_type: string;
  processed_at: Date;
};

export const ProcessedWebhook = new EntitySchema<ProcessedWebhookType>({
  name: "ProcessedWebhook",
  tableName: "processed_webhooks",

  columns: {
    id: {
      primary: true,
      type: "int",
      generated: "increment",
    },

    payment_id: {
      type: "varchar",
      nullable: false,
      unique: true,
    },

    order_id: {
      type: "uuid",
      nullable: false,
    },

    status_code: {
      type: "varchar",
      length: 10,
      nullable: false,
    },

    charge_type: {
      type: "varchar",
      length: 20,
      nullable: false,
      default: "'UNKNOWN'",
    },

    processed_at: {
      type: "timestamp",
      createDate: true,
    },
  },
});

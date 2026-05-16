import { EntitySchema } from "typeorm";

type WebhookLogType = {
  id: number;
  order_id?: string | null;
  payment_id?: string | null;
  status_code?: string | null;
  payload: Record<string, unknown>;
  error_message?: string | null;
  stack_trace?: string | null;
  created_at?: Date;
};

export const WebhookLog = new EntitySchema<WebhookLogType>({
  name: "WebhookLog",
  tableName: "webhook_logs",

  columns: {
    id: {
      primary: true,
      type: "int",
      generated: "increment",
    },
    order_id: {
      type: "varchar",
      nullable: true,
    },
    payment_id: {
      type: "varchar",
      nullable: true,
    },
    status_code: {
      type: "varchar",
      nullable: true,
    },
    payload: {
      type: "jsonb",
      nullable: false,
    },
    error_message: {
      type: "text",
      nullable: true,
    },
    stack_trace: {
      type: "text",
      nullable: true,
    },
    created_at: {
      type: "timestamp",
      createDate: true,
    },
  },
});

export interface UserRecord {
  id: number;
  name: string;
  email: string;
  password: string;
  userCount: number;
}

export interface OrderRecord {
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
}

export interface SubscriptionRecord {
  id: string;
  user_id: number;
  order_id: string;
  start_date: Date;
  end_date: Date;
  status: string;
}

export interface ProcessedWebhookRecord {
  id: number;
  payment_id: string;
  order_id: string;
  status_code: string;
  charge_type: string;
  processed_at: Date;
}

export interface WebhookLogRecord {
  id: number;
  order_id?: string | null;
  payment_id?: string | null;
  status_code?: string | null;
  payload: Record<string, unknown>;
  error_message?: string | null;
  stack_trace?: string | null;
  created_at?: Date;
}

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

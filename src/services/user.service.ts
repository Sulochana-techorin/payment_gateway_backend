import { AppDataSource } from "../config/data-source";
import { User } from "../entity/user";
import { Order } from "../entity/order";
import { Subscription } from "../entity/subscription";
import { UserRecord, OrderRecord, SubscriptionRecord } from "../types/models";
import { ApiError } from "../middleware/errorHandler";
import { UpdateProfilePayload } from "../validators/user.validator";

export async function getUserProfile(userId: number) {
  const userRepo = AppDataSource.getRepository<UserRecord>(User);

  const user = await userRepo.findOneBy({ id: userId });

  if (!user) {
    throw new ApiError(404, "User not found");
  }

  return {
    id: user.id,
    name: user.name,
    email: user.email,
    userCount: user.userCount,
  };
}

export async function updateUserProfile(userId: number, payload: UpdateProfilePayload) {
  const userRepo = AppDataSource.getRepository<UserRecord>(User);

  const user = await userRepo.findOneBy({ id: userId });

  if (!user) {
    throw new ApiError(404, "User not found");
  }

  if (payload.name) {
    user.name = payload.name.trim();
  }

  if (payload.email) {
    user.email = payload.email.trim();
  }

  const updated = await userRepo.save(user);

  return {
    id: updated.id,
    name: updated.name,
    email: updated.email,
    userCount: updated.userCount,
  };
}

export async function getUserSubscription(userId: number) {
  const orderRepo = AppDataSource.getRepository<OrderRecord>(Order);
  const subscriptionRepo = AppDataSource.getRepository<SubscriptionRecord>(Subscription);

  // Find the user's most recent ACTIVE order
  const orders = await orderRepo.find({
    where: { user_id: userId },
    order: { id: "DESC" } as any,
  });

  if (!orders || orders.length === 0) {
    return { hasSubscription: false, order: null, subscription: null };
  }

  // Find the active order first, otherwise fallback to latest
  const activeOrder = orders.find((o) => o.status === "ACTIVE") || orders[0];

  const subscription = await subscriptionRepo.findOneBy({ order_id: activeOrder.id });

  return {
    hasSubscription: Boolean(subscription),
    order: {
      id: activeOrder.id,
      user_count: activeOrder.user_count,
      base_price: activeOrder.base_price,
      price_per_user: activeOrder.price_per_user,
      subscription_amount: activeOrder.subscription_amount,
      total_amount: activeOrder.total_amount,
      status: activeOrder.status,
      currency: activeOrder.currency,
      payhere_subscription_id: (activeOrder as any).payhere_subscription_id || null,
    },
    subscription: subscription
      ? {
          id: subscription.id,
          status: subscription.status,
          start_date: subscription.start_date,
          end_date: subscription.end_date,
        }
      : null,
  };
}

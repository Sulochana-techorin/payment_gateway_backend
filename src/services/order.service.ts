import { AppDataSource } from "../config/data-source";
import { Order } from "../entity/order";
import { User } from "../entity/user";
import { OrderRecord, UserRecord } from "../types/models";
import { getPricingConfig } from "../config/pricing";
import { ApiError } from "../middleware/errorHandler";

export async function createOrderForUser(userId: number, providedUserCount?: number) {
  const userRepo = AppDataSource.getRepository<UserRecord>(User);
  const orderRepo = AppDataSource.getRepository<OrderRecord>(Order);

  const user = await userRepo.findOneBy({ id: userId });

  if (!user) {
    throw new ApiError(404, "User not found");
  }

  // Update userCount if provided
  if (providedUserCount !== undefined && providedUserCount > 0) {
    user.userCount = providedUserCount;
    await userRepo.save(user);
  }

  const userCount = user.userCount;

  if (userCount < 0) {
    throw new ApiError(400, "Invalid user count");
  }

  // Check if user has previously paid the registration fee
  // (Meaning they have an ACTIVE or CANCELLED order)
  const previousOrders = await orderRepo.find({
    where: [
      { user_id: userId, status: "ACTIVE" },
      { user_id: userId, status: "CANCELLED" }
    ]
  });

  const hasPaidRegistration = previousOrders.length > 0;
  const { basePrice, pricePerUser } = getPricingConfig();
  
  const actualBasePrice = hasPaidRegistration ? 0 : basePrice;
  const subscription_amount = userCount * pricePerUser;
  const total_amount = actualBasePrice + subscription_amount;

  const newOrder = orderRepo.create({
    user_id: userId,
    user_count: userCount,
    base_price: actualBasePrice,
    price_per_user: pricePerUser,
    subscription_amount,
    total_amount,
    status: "PENDING",
    currency: process.env.CURRENCY,
  });

  const order = await orderRepo.save(newOrder);

  return order;
}

export async function getOrderById(id: string) {
  const orderRepo = AppDataSource.getRepository<OrderRecord>(Order);

  return orderRepo.findOneBy({ id });
}

export async function updateOrderStatusById(id: string, status: string) {
  const orderRepo = AppDataSource.getRepository<OrderRecord>(Order);
  const order = await orderRepo.findOneBy({ id });

  if (!order) {
    throw new ApiError(404, "Order not found");
  }

  order.status = status;
  return orderRepo.save(order);
}

export async function updateOrderInvoicePathById(id: string, invoicePath: string) {
  const orderRepo = AppDataSource.getRepository<OrderRecord>(Order);
  const order = await orderRepo.findOneBy({ id });

  if (!order) {
    throw new ApiError(404, "Order not found");
  }

  order.invoice_path = invoicePath;
  return orderRepo.save(order);
}

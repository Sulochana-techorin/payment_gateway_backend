import { Request, Response } from "express";

import { AuthenticatedRequest } from "../middleware/authMiddleware";
import { getUserProfile, updateUserProfile, getUserSubscription } from "../services/user.service";
import { initiateCardUpdate, cancelPayhereSubscription } from "../services/payment.service";
import { sendCardUpdateEmail } from "../services/email.service";
import { UpdateProfilePayload } from "../validators/user.validator";
import { requireBody } from "../validators/schema";
import { ApiError } from "../middleware/errorHandler";
import { AppDataSource } from "../config/data-source";
import { Order } from "../entity/order";
import { User } from "../entity/user";
import { Subscription } from "../entity/subscription";

export async function getProfile(req: Request, res: Response) {
  const authReq = req as AuthenticatedRequest;

  if (!authReq.user) {
    throw new ApiError(401, "Authentication required");
  }

  const profile = await getUserProfile(authReq.user.userId);
  res.json(profile);
}

export async function updateProfile(req: Request, res: Response) {
  const authReq = req as AuthenticatedRequest;

  if (!authReq.user) {
    throw new ApiError(401, "Authentication required");
  }

  const payload = requireBody<UpdateProfilePayload>(req);
  const updated = await updateUserProfile(authReq.user.userId, payload);

  res.json({
    message: "Profile updated successfully",
    ...updated,
  });
}

export async function getSubscription(req: Request, res: Response) {
  const authReq = req as AuthenticatedRequest;

  if (!authReq.user) {
    throw new ApiError(401, "Authentication required");
  }

  const data = await getUserSubscription(authReq.user.userId);
  res.json(data);
}

export async function updateCard(req: Request, res: Response) {
  const authReq = req as AuthenticatedRequest;

  if (!authReq.user) {
    throw new ApiError(401, "Authentication required");
  }

  const result = await initiateCardUpdate(authReq.user.userId);
  res.json(result);
}

export async function confirmCardUpdate(req: Request, res: Response) {
  const authReq = req as AuthenticatedRequest;

  if (!authReq.user) {
    throw new ApiError(401, "Authentication required");
  }

  const userId = authReq.user.userId;
  const userRepo = AppDataSource.getRepository(User);
  const orderRepo = AppDataSource.getRepository(Order);

  const user = await userRepo.findOneBy({ id: userId });
  if (!user) throw new ApiError(404, "User not found");

  const orders = await orderRepo.find({
    where: { user_id: userId },
    order: { id: "DESC" } as any,
  });

  const activeOrder = orders.find((o: any) => o.status === "ACTIVE");
  if (!activeOrder) {
    throw new ApiError(400, "No active subscription found");
  }

  try {
    await sendCardUpdateEmail(
      (user as any).email,
      (user as any).name,
      (activeOrder as any).id,
    );
    console.log("📧 Card update confirmation email sent to", (user as any).email);

    res.json({
      success: true,
      message: "Card update confirmed. Email notification sent.",
      emailSentTo: (user as any).email,
    });
  } catch (err) {
    console.error("❌ Failed to send card update confirmation email:", err);
    res.json({
      success: false,
      message: "Card update confirmed but email notification failed.",
    });
  }
}

/**
 * POST /api/user/cancel-subscription
 * 
 * Cancels the active subscription. It updates the database and calls PayHere's API.
 */
export async function cancelSubscription(req: Request, res: Response) {
  const authReq = req as AuthenticatedRequest;

  if (!authReq.user) {
    throw new ApiError(401, "Authentication required");
  }

  const userId = authReq.user.userId;
  const orderRepo = AppDataSource.getRepository(Order);
  const subscriptionRepo = AppDataSource.getRepository(Subscription);

  // Find active order
  const orders = await orderRepo.find({
    where: { user_id: userId },
    order: { id: "DESC" } as any,
  });

  const activeOrder = orders.find((o: any) => o.status === "ACTIVE");
  if (!activeOrder) {
    throw new ApiError(400, "No active subscription found to cancel");
  }

  // Cancel in PayHere if a subscription token/ID is present
  const payhereSubId = (activeOrder as any).payhere_subscription_id;
  let payhereCancelStatus = "not_attempted";
  if (payhereSubId) {
    const success = await cancelPayhereSubscription(payhereSubId);
    payhereCancelStatus = success ? "cancelled" : "failed_or_sandbox";
    if (!success) {
      console.warn(`⚠️ Could not automatically cancel PayHere subscription ${payhereSubId}. It may already be cancelled, sandbox limitation, or API keys are missing.`);
    }
  } else {
    payhereCancelStatus = "no_subscription_id";
    console.warn("⚠️ No payhere_subscription_id found on order. Cannot notify PayHere.");
  }

  // Update local statuses
  activeOrder.status = "CANCELLED";
  await orderRepo.save(activeOrder);

  const activeSub = await subscriptionRepo.findOneBy({ order_id: activeOrder.id });
  if (activeSub) {
    activeSub.status = "CANCELLED";
    await subscriptionRepo.save(activeSub);
  }

  res.json({
    success: true,
    message: "Subscription cancelled successfully",
    payhereCancelStatus,
  });
}


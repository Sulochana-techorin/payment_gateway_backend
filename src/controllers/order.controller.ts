import { Request, Response } from "express";

import { createOrderForUser, getOrderById, updateOrderStatusById } from "../services/order.service";
import { CreateOrderPayload } from "../validators/order.validator";
import { requireBody } from "../validators/schema";
import { ApiError } from "../middleware/errorHandler";

export async function createOrder(req: Request, res: Response) {
  const payload = requireBody<CreateOrderPayload>(req);
  const order = await createOrderForUser(payload.user_id, payload.user_count);

  res.status(201).json({
    message: "Order created",
    order,
  });
}

export async function getOrder(req: Request, res: Response) {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const order = await getOrderById(id);

  if (!order) {
    throw new ApiError(404, "Order not found");
  }

  res.json(order);
}

/**
 * POST /api/order/cancel
 * Called from the PayHere cancel_url redirect.
 * Marks a PENDING order as FAILED so the admin panel reflects reality.
 */
export async function cancelOrder(req: Request, res: Response) {
  const payload = req.body as Record<string, unknown>;
  const orderId = typeof payload.orderId === "string" ? payload.orderId.trim() : "";

  if (!orderId) {
    throw new ApiError(400, "orderId is required");
  }

  const order = await getOrderById(orderId);

  if (!order) {
    throw new ApiError(404, "Order not found");
  }

  // Only update if still PENDING — don't overwrite an already-ACTIVE order
  if (order.status === "PENDING") {
    const updated = await updateOrderStatusById(orderId, "FAILED");
    res.json({ orderId, status: updated.status });
    return;
  }

  res.json({ orderId, status: order.status });
}

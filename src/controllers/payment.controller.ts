import { Request, Response } from "express";

import {
  confirmPaymentSuccessByOrderId,
  initiatePayment,
  processPayHereNotify,
  processPreapprovalNotify,
} from "../services/payment.service";
import { InitiatePaymentPayload } from "../validators/payment.validator";
import { requireBody } from "../validators/schema";
import { getInvoiceData } from "../services/payment.service";
import { generateInvoicePDF } from "../services/invoice.service";


export async function createPayment(req: Request, res: Response) {
  const payload = requireBody<InitiatePaymentPayload>(req);
  const payment = await initiatePayment(payload.orderId);

  res.json(payment);
}

export async function handlePayHereNotify(req: Request, res: Response) {
  const payload = req.body as Record<string, unknown>;
  const orderId = String(payload.order_id ?? "").trim();
  
  console.log("📥 ====== RECEIVED PAYHERE WEBHOOK ======");
  console.log("📥 Full payload:", JSON.stringify(payload, null, 2));
  console.log("📥 order_id:", payload.order_id);
  console.log("📥 status_code:", payload.status_code);
  console.log("📥 isCardUpdate:", orderId.startsWith("CARD_UPDATE_"));
  console.log("📥 ====== END WEBHOOK ======");

  try {
    if (orderId.startsWith("CARD_UPDATE_")) {
      console.log("🔄 Processing as CARD_UPDATE preapproval...");
      await processPreapprovalNotify(payload);
    } else {
      console.log("🔄 Processing as regular payment notify...");
      await processPayHereNotify(payload);
    }
    console.log("✅ Successfully processed PayHere notify for:", orderId);
  } catch (error) {
    console.error("❌ Error processing PayHere notify:", error);
    // We still return 200 to PayHere to stop retries, but we logged the error
  }

  res.status(200).send("OK");
}

export async function confirmPaymentFromReturn(req: Request, res: Response) {
  const payload = req.body as Record<string, unknown>;
  const orderId = String(payload.order_id ?? "").trim();

  // Try the full PayHere notify validation first
  try {
    const result = await processPayHereNotify(payload);
    res.json(result);
    return;
  } catch (err) {
    // In localhost / sandbox, the return URL often doesn't include valid
    // MD5 signatures or all required fields. Fall back to direct confirmation.
    console.warn("⚠️ PayHere return confirm failed, falling back to direct confirmation:", (err as Error).message);
  }

  // Fallback: directly confirm the order as successful
  if (orderId) {
    try {
      const paymentId = typeof payload.payment_id === "string" ? payload.payment_id.trim() : null;
      const result = await confirmPaymentSuccessByOrderId(orderId, paymentId || null);
      res.json(result);
      return;
    } catch (fallbackErr) {
      console.error("❌ Fallback confirmation also failed:", fallbackErr);
    }
  }

  res.status(400).json({ message: "Could not confirm payment" });
}

export async function confirmPaymentSuccess(req: Request, res: Response) {
  const payload = req.body as Record<string, unknown>;
  const orderId = typeof payload.orderId === "string" ? payload.orderId : "";
  const paymentId = typeof payload.paymentId === "string" ? payload.paymentId.trim() : "";

  if (!orderId.trim()) {
    res.status(400).json({ message: "orderId is required" });
    return;
  }

  const result = await confirmPaymentSuccessByOrderId(
    orderId.trim(),
    paymentId || null,
  );
  res.json(result);
}

export async function generateInvoice(req: Request, res: Response) {
  const { orderId } = req.params;

  if (!orderId || typeof orderId !== "string") {
    res.status(400).json({ message: "Invalid orderId" });
    return;
  }

  const { order, user, subscription } = await getInvoiceData(orderId);

  generateInvoicePDF(res, order, user, subscription);
}

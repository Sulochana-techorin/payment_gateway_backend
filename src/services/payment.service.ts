import crypto from "crypto";
import fs from "fs/promises";
import fsSync from "fs";

import { AppDataSource } from "../config/data-source";
import { Order } from "../entity/order";
import { Subscription } from "../entity/subscription";
import { User } from "../entity/user";
import { ProcessedWebhook } from "../entity/processed-webhook";
import { ApiError } from "../middleware/errorHandler";
import { OrderRecord, SubscriptionRecord, UserRecord, ProcessedWebhookRecord } from "../types/models";
import { updateOrderInvoicePathById, updateOrderStatusById } from "./order.service";
import { createInvoiceFile } from "./invoice.service";
import { sendPaymentSuccessEmail, sendCardUpdateEmail, sendPaymentFailedEmail, sendRenewalSuccessEmail, sendRefundSuccessEmail } from "./email.service";

type PayHereFields = {
  merchant_id: string;
  return_url: string;
  cancel_url: string;
  notify_url: string;
  order_id: string;
  items: string;
  currency: string;
  amount: string;
  subscription?: string;
  recurrence?: string;
  duration?: string;
  startup_fee?: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  address: string;
  city: string;
  country: string;
  hash: string;
};

type InitiatePaymentResponse = {
  checkoutUrl: string;
  fields: PayHereFields;
};

type PayHereNotifyPayload = {
  merchant_id: string;
  order_id: string;
  payhere_amount: string;
  payhere_currency: string;
  status_code: string;
  md5sig: string;
  payment_id?: string;
  subscription_id?: string;
};

type InvoiceData = {
  order: OrderRecord;
  user: UserRecord;
  subscription: SubscriptionRecord;
};

const emailedSuccessOrders = new Set<string>();

// Idempotency: in-memory cache (L1) + database (L2) for processed payment_ids.
// The in-memory Set is a fast cache to avoid DB hits within the same server session.
// The DB table is the source of truth and survives restarts/redeployments.
const processedPaymentIdsCache = new Set<string>();

// Per-order mutex to serialize concurrent processing (webhook vs return URL).
// Prevents two async paths from processing the same order simultaneously.
const orderLocks = new Map<string, Promise<void>>();

/**
 * Acquire a per-order lock. Returns a release function.
 * Ensures that only one async operation processes a given order at a time.
 */
function acquireOrderLock(orderId: string): Promise<() => void> {
  const existingLock = orderLocks.get(orderId) ?? Promise.resolve();

  let releaseFn: () => void;
  const newLock = new Promise<void>((resolve) => {
    releaseFn = () => {
      orderLocks.delete(orderId);
      resolve();
    };
  });

  orderLocks.set(orderId, newLock);

  return existingLock.then(() => releaseFn!);
}

/**
 * Atomically claim a payment_id for processing.
 * Uses INSERT with unique constraint as a database-level lock.
 *
 * Returns true if THIS caller claimed it (proceed with processing).
 * Returns false if another process already claimed it (skip processing).
 *
 * This eliminates the TOCTOU race between check-then-act:
 * - Old pattern: check if exists → (gap where race happens) → insert
 * - New pattern: try insert → success = you own it, failure = someone else does
 */
async function claimPaymentForProcessing(
  paymentId: string,
  orderId: string,
  statusCode: string,
  chargeType: string,
): Promise<boolean> {
  // L1: fast in-memory check (safe because once added, never removed)
  if (processedPaymentIdsCache.has(paymentId)) {
    return false;
  }

  // L2: atomic INSERT — whoever succeeds first owns the processing
  const webhookRepo = AppDataSource.getRepository<ProcessedWebhookRecord>(ProcessedWebhook);

  try {
    const record = webhookRepo.create({
      payment_id: paymentId,
      order_id: orderId,
      status_code: statusCode,
      charge_type: chargeType,
    });
    await webhookRepo.save(record);
    processedPaymentIdsCache.add(paymentId);
    console.log(`🔒 Payment ${paymentId} claimed for processing (charge: ${chargeType})`);
    return true; // We own it — proceed with processing
  } catch (error: any) {
    if (error?.code === '23505') {
      // Unique constraint violation — another process already claimed it
      console.log(`⚡ Payment ${paymentId} already claimed by another process`);
      processedPaymentIdsCache.add(paymentId);
      return false; // Skip — someone else is handling it
    }
    // Unexpected DB error — log but allow processing to continue
    // (better to risk a duplicate than to silently drop a payment)
    console.error(`❌ Failed to claim payment ${paymentId}:`, error);
    return true;
  }
}

/**
 * Check if a payment_id has already been processed (read-only check).
 * Used by the fallback path to see if the webhook already handled things.
 */
async function isPaymentAlreadyProcessed(paymentId: string): Promise<boolean> {
  if (processedPaymentIdsCache.has(paymentId)) {
    return true;
  }

  const webhookRepo = AppDataSource.getRepository<ProcessedWebhookRecord>(ProcessedWebhook);
  const existing = await webhookRepo.findOneBy({ payment_id: paymentId });

  if (existing) {
    processedPaymentIdsCache.add(paymentId);
    return true;
  }

  return false;
}


type EmailTask = {
  invoiceData: InvoiceData;
  paymentId: string | null;
  invoicePath: string;
  attempt: number;
};

const emailQueue: EmailTask[] = [];
let emailProcessing = false;

async function processEmailQueue() {
  if (emailProcessing || emailQueue.length === 0) {
    return;
  }

  emailProcessing = true;

  while (emailQueue.length > 0) {
    const task = emailQueue.shift();
    if (!task) break;

    const maxRetries = 3;
    const delayMs = Math.min(1000 * Math.pow(2, task.attempt), 10000);

    try {
      console.log(
        `📧 Processing email task for order ${task.invoiceData.order.id} (attempt ${task.attempt + 1}/${maxRetries})`,
      );

      await sendSuccessEmailForInvoiceData(task.invoiceData, task.paymentId, task.invoicePath);

      console.log(`✅ Email sent successfully for order ${task.invoiceData.order.id}`);
      emailedSuccessOrders.add(task.invoiceData.order.id);
    } catch (error) {
      console.error(`❌ Email failed for order ${task.invoiceData.order.id}:`, error);

      if (task.attempt < maxRetries - 1) {
        console.log(
          `⏳ Retrying in ${delayMs}ms... (attempt ${task.attempt + 1}/${maxRetries})`,
        );
        await new Promise((resolve) => setTimeout(resolve, delayMs));
        emailQueue.push({ ...task, attempt: task.attempt + 1 });
      } else {
        console.error(`❌ Email permanently failed for order ${task.invoiceData.order.id} after ${maxRetries} attempts`);
      }
    }
  }

  emailProcessing = false;
}

function getEnv(name: string): string {
  const value = process.env[name];

  if (!value || value.trim() === "") {
    throw new ApiError(500, `Missing required environment variable: ${name}`);
  }

  return value.trim();
}

function getSubscriptionDurationDays(): number {
  const raw = getEnv("SUBSCRIPTION_DURATION_DAYS");
  const parsed = Number.parseInt(raw, 10);

  if (Number.isNaN(parsed) || parsed <= 0) {
    throw new ApiError(500, "SUBSCRIPTION_DURATION_DAYS must be a positive integer");
  }

  return parsed;
}

function buildInvoiceUrl(orderId: string): string {
  const backendBaseUrl = getEnv("BACKEND_BASE_URL").replace(/\/+$/, "");
  return `${backendBaseUrl}/api/payment/invoice/${orderId}`;
}

async function hasFile(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function sendSuccessEmailForInvoiceData(
  invoiceData: InvoiceData,
  paymentId: string | null,
  invoicePath: string,
) {
  const currency = getEnv("CURRENCY");
  const invoicePathForAttachment = (await hasFile(invoicePath)) ? invoicePath : undefined;

  await sendPaymentSuccessEmail({
    to: invoiceData.user.email,
    customerName: invoiceData.user.name,
    orderId: invoiceData.order.id,
    paymentId,
    amount: Number(invoiceData.order.total_amount).toFixed(2),
    currency,
    orderStatus: invoiceData.order.status,
    subscriptionStatus: invoiceData.subscription.status,
    subscriptionStartDate: invoiceData.subscription.start_date,
    subscriptionEndDate: invoiceData.subscription.end_date,
    invoiceUrl: buildInvoiceUrl(invoiceData.order.id),
    invoicePath: invoicePathForAttachment,
  });
}

async function trySendSuccessEmail(
  invoiceData: InvoiceData,
  paymentId: string | null,
  invoicePath: string,
): Promise<boolean> {
  console.log("🔥 EMAIL ENQUEUED for order:", invoiceData.order.id);

  if (emailedSuccessOrders.has(invoiceData.order.id)) {
    console.log("⚠️ Success email already sent, skipping");
    return true;
  }

  emailQueue.push({
    invoiceData,
    paymentId,
    invoicePath,
    attempt: 0,
  });

  setImmediate(() => {
    processEmailQueue().catch((err) => console.error("Email queue processor error:", err));
  });

  return true;
}

function splitName(name: string): { firstName: string; lastName: string } {
  const normalized = name.trim();

  if (normalized.length === 0) {
    return { firstName: "Customer", lastName: "" };
  }

  const [firstName, ...rest] = normalized.split(/\s+/);

  return {
    firstName,
    lastName: rest.join(" "),
  };
}

function toRequiredString(payload: Record<string, unknown>, key: string): string {
  const value = payload[key];

  if (typeof value !== "string" || value.trim() === "") {
    throw new ApiError(400, `${key} is required`);
  }

  return value.trim();
}

function mapPayHereStatus(statusCode: number): string | null {
  // PayHere status codes:
  //  2  = success / active
  //  0  = pending
  // -1  = cancelled  → treat as FAILED
  // -2  = failed     → FAILED
  // -3  = chargedback → treat as FAILED
  switch (statusCode) {
    case 2: return "ACTIVE";
    case 0: return "PENDING";
    case -1: return "FAILED";
    case -2: return "FAILED";
    case -3: return "FAILED";
    default: return null; // unknown — do not touch
  }
}

function parseNotifyPayload(payload: Record<string, unknown>): PayHereNotifyPayload {
  return {
    merchant_id: toRequiredString(payload, "merchant_id"),
    order_id: toRequiredString(payload, "order_id"),
    payhere_amount: toRequiredString(payload, "payhere_amount"),
    payhere_currency: toRequiredString(payload, "payhere_currency"),
    status_code: toRequiredString(payload, "status_code"),
    md5sig: toRequiredString(payload, "md5sig").toUpperCase(),
    payment_id: typeof payload.payment_id === "string" ? payload.payment_id.trim() : undefined,
    subscription_id: typeof payload.subscription_id === "string" ? payload.subscription_id.trim() : undefined,
  };
}

function buildNotifySignature(payload: PayHereNotifyPayload, merchantSecret: string): string {
  const secretHash = crypto.createHash("md5").update(merchantSecret).digest("hex").toUpperCase();

  return crypto
    .createHash("md5")
    .update(
      `${payload.merchant_id}${payload.order_id}${payload.payhere_amount}${payload.payhere_currency}${payload.status_code}${secretHash}`,
    )
    .digest("hex")
    .toUpperCase();
}

function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

function getOrderAmounts(order: OrderRecord) {
  return {
    registrationFee: Number(order.base_price).toFixed(2),
    recurringAmount: Number(order.subscription_amount).toFixed(2),
    firstChargeAmount: Number(order.total_amount).toFixed(2),
  };
}

function determineChargeType(
  order: OrderRecord,
  payhereAmount: string,
  subscriptionId?: string,
): "INITIAL" | "RENEWAL" {
  // PRIMARY: If this order already has a stored subscription_id and the
  // incoming webhook carries a subscription_id, this is a recurring charge.
  // PayHere sends the same subscription_id for all charges belonging to the
  // same subscription.
  const existingSubId = (order as any).payhere_subscription_id;
  if (existingSubId && subscriptionId && existingSubId === subscriptionId) {
    return "RENEWAL";
  }

  // SECONDARY: If the order is already ACTIVE and PayHere sends a
  // subscription_id (even if we haven't stored it yet or it was overwritten
  // by a card update), treat it as a RENEWAL.
  if (order.status === "ACTIVE" && subscriptionId) {
    return "RENEWAL";
  }

  // TERTIARY: Use amount comparison as fallback —
  // If the charged amount matches the recurring amount (not the first-time
  // total that includes the startup fee), it must be a renewal.
  const normalizedAmount = Number(payhereAmount).toFixed(2);
  const { recurringAmount, firstChargeAmount } = getOrderAmounts(order);

  if (normalizedAmount === recurringAmount && order.status === "ACTIVE") {
    return "RENEWAL";
  }

  // Default: treat as INITIAL (first payment or retry of first payment)
  return "INITIAL";
}

function toSafeDate(value: unknown): Date {
  if (value instanceof Date) return value;
  if (typeof value === "string" || typeof value === "number") {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  return new Date(); // fallback to now
}

async function ensureSubscriptionForOrder(
  order: OrderRecord,
  chargeType: "INITIAL" | "RENEWAL" = "INITIAL",
  chargedAt: Date = new Date(),
) {
  const subscriptionRepo = AppDataSource.getRepository<SubscriptionRecord>(Subscription);

  const existing = await subscriptionRepo.findOneBy({ order_id: order.id });
  const durationDays = getSubscriptionDurationDays();

  if (!existing) {
    const startDate = chargedAt;
    const endDate = addDays(startDate, durationDays);

    const subscription = subscriptionRepo.create({
      user_id: order.user_id,
      order_id: order.id,
      start_date: startDate,
      end_date: endDate,
      status: "ACTIVE",
    });

    return subscriptionRepo.save(subscription);
  }

  if (chargeType === "INITIAL") {
    return existing;
  }

  // RENEWAL: extend from the current end_date when the subscription hasn't
  // expired yet, otherwise start a fresh period from the charge time.
  // NOTE: TypeORM may return timestamp columns as strings from PostgreSQL,
  // so we must parse them safely before comparing.
  const currentEndDate = toSafeDate(existing.end_date);

  const renewalStartDate =
    currentEndDate.getTime() > chargedAt.getTime()
      ? currentEndDate
      : chargedAt;

  //existing.start_date = chargedAt;
  existing.end_date = addDays(renewalStartDate, durationDays);
  existing.status = "ACTIVE";

  console.log(`🔄 RENEWAL: extending subscription for order ${order.id}`);
  console.log(`   Previous end_date: ${currentEndDate.toISOString()}`);
  console.log(`   New start_date: ${chargedAt.toISOString()}`);
  console.log(`   New end_date: ${existing.end_date.toISOString()}`);

  return subscriptionRepo.save(existing);
}

export async function initiatePayment(orderId: string): Promise<InitiatePaymentResponse> {
  const orderRepo = AppDataSource.getRepository<OrderRecord>(Order);
  const userRepo = AppDataSource.getRepository<UserRecord>(User);

  const order = await orderRepo.findOneBy({ id: orderId });
  if (!order) throw new ApiError(404, "Order not found");

  const user = await userRepo.findOneBy({ id: order.user_id });
  if (!user) throw new ApiError(404, "User not found");

  const merchantId = getEnv("PAYHERE_MERCHANT_ID");
  const merchantSecret = getEnv("PAYHERE_MERCHANT_SECRET");
  const currency = getEnv("CURRENCY");

  const baseFrontendUrl = getEnv("FRONTEND_BASE_URL");
  const notifyUrl = getEnv("PAYHERE_NOTIFY_URL");
  const checkoutUrl = getEnv("PAYHERE_CHECKOUT_URL");

  // 🔥 Correct formatting (CRITICAL)
  const recurringAmount = Number(order.subscription_amount).toFixed(2);
  const startupFee = Number(order.base_price).toFixed(2);

  const recurrence = getEnv("PAYHERE_RECURRENCE");
  const duration = getEnv("PAYHERE_RECURRING_DURATION");

  // 🔥 REQUIRED for subscription mode
  const subscription = getEnv("PAYHERE_SUBSCRIPTION_FLAG");

  // 🔥 Hash must match ONLY amount (NOT total, NOT startup_fee)
  const secretHash = crypto
    .createHash("md5")
    .update(merchantSecret)
    .digest("hex")
    .toUpperCase();

  // 🔥 CRITICAL FIX: PayHere REQUIRES the hash to use (recurringAmount + startupFee) 
  // when a startup_fee is present. This does NOT change the amount charged, it is just for security validation!
  const hashAmount = Number(Number(recurringAmount) + Number(startupFee)).toFixed(2);

  const hash = crypto
    .createHash("md5")
    .update(`${merchantId}${order.id}${hashAmount}${currency}${secretHash}`)
    .digest("hex")
    .toUpperCase();

  const { firstName, lastName } = splitName(user.name);

  const recurrenceDisplay = recurrence === '1 Week' ? 'Weekly' : recurrence === '1 Month' ? 'Monthly' : recurrence === '1 Year' ? 'Yearly' : recurrence;

  const fields: PayHereFields = {
    merchant_id: merchantId,
    return_url: `${baseFrontendUrl}/payment/success?orderId=${order.id}`,
    cancel_url: `${baseFrontendUrl}/payment/cancel?orderId=${order.id}`,
    notify_url: notifyUrl,

    order_id: order.id,
    items: startupFee === "0.00"
      ? `${recurrenceDisplay} Subscription (${recurringAmount})`
      : `Registration Fee (${startupFee}) + ${recurrenceDisplay} Subscription (${recurringAmount})`,

    currency,

    // 🔥 CORE LOGIC
    amount: recurringAmount,
    startup_fee: startupFee,
    subscription,
    recurrence,
    duration,

    first_name: firstName,
    last_name: lastName || "N/A",
    email: user.email,
    phone: getEnv("PAYHERE_DEFAULT_PHONE"),
    address: getEnv("PAYHERE_DEFAULT_ADDRESS"),
    city: getEnv("PAYHERE_DEFAULT_CITY"),
    country: getEnv("PAYHERE_DEFAULT_COUNTRY"),

    hash,
  };

  console.log("\n=======================================================");
  console.log("📤 [PAYHERE] OUTGOING INITIATE PAYMENT CALL:");
  console.log("URL:", checkoutUrl);
  console.log("PAYLOAD:", JSON.stringify(fields, null, 2));
  console.log("=======================================================\n");

  return {
    checkoutUrl,
    fields,
  };
}

export async function processPayHereNotify(rawPayload: Record<string, unknown>) {
  const payload = parseNotifyPayload(rawPayload);
  const merchantId = getEnv("PAYHERE_MERCHANT_ID");
  const merchantSecret = getEnv("PAYHERE_MERCHANT_SECRET");
  const currency = getEnv("CURRENCY");

  if (payload.merchant_id !== merchantId) {
    throw new ApiError(400, "Invalid merchant_id");
  }

  if (payload.payhere_currency !== currency) {
    throw new ApiError(400, "Invalid payhere_currency");
  }

  const expectedSig = buildNotifySignature(payload, merchantSecret);

  if (payload.md5sig !== expectedSig) {
    throw new ApiError(400, "Invalid md5sig");
  }

  // 🔒 Acquire per-order lock to prevent webhook vs return URL race
  const releaseLock = await acquireOrderLock(payload.order_id);

  try {
    // 🔥 Atomic idempotency: try to claim this payment_id FIRST.
    // If another process (webhook retry or return URL) already claimed it, skip.
    if (payload.payment_id) {
      // We need the order and charge type for the claim record,
      // so do a quick pre-check before the full claim.
      const alreadyDone = await isPaymentAlreadyProcessed(payload.payment_id);
      if (alreadyDone) {
        console.log(`⚡ Skipping duplicate webhook for payment_id: ${payload.payment_id} (DB-verified)`);
        return {
          orderId: payload.order_id,
          status: "ALREADY_PROCESSED",
          paymentId: payload.payment_id,
        };
      }
    }

    const orderRepo = AppDataSource.getRepository<OrderRecord>(Order);
    const order = await orderRepo.findOneBy({ id: payload.order_id });

    if (!order) {
      throw new ApiError(404, "Order not found");
    }

    // 🔥 Use subscription_id as primary signal for INITIAL vs RENEWAL
    const chargeType = determineChargeType(order, payload.payhere_amount, payload.subscription_id);

    console.log(`📊 Charge type: ${chargeType} | order.status: ${order.status} | amount: ${payload.payhere_amount} | subscription_id: ${payload.subscription_id ?? "N/A"}`);

    const statusCode = Number.parseInt(payload.status_code, 10);

    if (Number.isNaN(statusCode)) {
      throw new ApiError(400, "Invalid status_code");
    }

    const nextStatus = mapPayHereStatus(statusCode);

    // Unknown code — do nothing
    if (!nextStatus) {
      return {
        orderId: order.id,
        status: order.status,
        paymentId: payload.payment_id ?? null,
      };
    }

    // 🔥 Atomic claim: INSERT into processed_webhooks. If unique violation,
    // another process beat us — skip all processing.
    if (payload.payment_id) {
      const claimed = await claimPaymentForProcessing(
        payload.payment_id,
        order.id,
        payload.status_code,
        chargeType,
      );
      if (!claimed) {
        console.log(`⚡ Payment ${payload.payment_id} already claimed, skipping`);
        return {
          orderId: order.id,
          status: "ALREADY_PROCESSED",
          paymentId: payload.payment_id,
        };
      }
    }

    // Persist the new status (ACTIVE, FAILED, CANCELLED, PENDING, etc.)
    const wasAlreadyActive = order.status === "ACTIVE";
    const updatedOrder = await updateOrderStatusById(order.id, nextStatus);

    // Only do invoice + subscription + email on a successful ACTIVE transition
    if (nextStatus !== "ACTIVE") {
      // If a payment failed (card declined, no funds, etc.), email the user
      if (nextStatus === "FAILED") {
        const userRepo = AppDataSource.getRepository<UserRecord>(User);
        const user = await userRepo.findOneBy({ id: order.user_id });
        if (user) {
          try {
            const frontendUrl = getEnv("FRONTEND_BASE_URL").replace(/\/+$/, "");
            const cardUpdateUrl = `${frontendUrl}/dashboard`;
            const currency = getEnv("CURRENCY");
            const amount = chargeType === "RENEWAL"
              ? Number(order.subscription_amount).toFixed(2)
              : Number(order.total_amount).toFixed(2);

            await sendPaymentFailedEmail(
              user.email,
              user.name,
              order.id,
              amount,
              currency,
              cardUpdateUrl,
            );
            console.log("📧 Payment failed notification sent to", user.email);
          } catch (err) {
            console.error("❌ Failed to send payment failed email:", err);
          }
        }
      }

      return {
        orderId: updatedOrder.id,
        status: updatedOrder.status,
        paymentId: payload.payment_id ?? null,
      };
    }

    await ensureSubscriptionForOrder(updatedOrder as OrderRecord, chargeType);

    // Store PayHere subscription_id if provided (critical for future RENEWAL detection).
    // Only store if the order doesn't already have one, or if this is the first payment.
    // Card updates use a separate field (customer_token) and should NOT overwrite this.
    if (payload.subscription_id) {
      const orderRepoForUpdate = AppDataSource.getRepository<OrderRecord>(Order);
      const orderToUpdate = await orderRepoForUpdate.findOneBy({ id: updatedOrder.id });
      if (orderToUpdate) {
        const existingSubId = (orderToUpdate as any).payhere_subscription_id;
        if (!existingSubId || chargeType === "INITIAL") {
          (orderToUpdate as any).payhere_subscription_id = payload.subscription_id;
          await orderRepoForUpdate.save(orderToUpdate);
          console.log(`✅ Stored subscription_id: ${payload.subscription_id} for order: ${updatedOrder.id}`);
        } else {
          console.log(`ℹ️ subscription_id already set (${existingSubId}), skipping overwrite for order: ${updatedOrder.id}`);
        }
      }
    }

    // Generate invoice file after successful activation.
    const invoiceData = await getInvoiceData(updatedOrder.id);
    const invoicePath = await createInvoiceFile(invoiceData);
    await updateOrderInvoicePathById(updatedOrder.id, invoicePath);

    // Send appropriate email based on charge type
    if (!wasAlreadyActive && updatedOrder.status === "ACTIVE") {
      // First-time activation: send full success email with invoice
      await trySendSuccessEmail(
        {
          ...invoiceData,
          order: {
            ...invoiceData.order,
            status: updatedOrder.status,
            invoice_path: invoicePath,
          },
        },
        payload.payment_id ?? null,
        invoicePath,
      );
    } else if (chargeType === "RENEWAL" && updatedOrder.status === "ACTIVE") {
      // Renewal success: send renewal confirmation email
      const userRepo = AppDataSource.getRepository<UserRecord>(User);
      const user = await userRepo.findOneBy({ id: order.user_id });
      if (user) {
        try {
          const currency = getEnv("CURRENCY");
          const amount = Number(order.subscription_amount).toFixed(2);
          const subscriptionRepo = AppDataSource.getRepository<SubscriptionRecord>(Subscription);
          const sub = await subscriptionRepo.findOneBy({ order_id: order.id });
          const newEndDate = sub?.end_date ? new Date(sub.end_date).toISOString() : "N/A";

          await sendRenewalSuccessEmail(
            user.email,
            user.name,
            order.id,
            amount,
            currency,
            newEndDate,
          );
          console.log("📧 Renewal success email sent to", user.email);
        } catch (err) {
          console.error("❌ Failed to send renewal success email:", err);
        }
      }
    }

    return {
      orderId: updatedOrder.id,
      status: updatedOrder.status,
      chargeType,
      paymentId: payload.payment_id ?? null,
    };
  } finally {
    releaseLock();
  }
}


export async function confirmPaymentSuccessByOrderId(
  orderId: string,
  paymentId: string | null = null
) {
  console.log("✅ Manual/return payment success triggered:", orderId);

  // 🔒 Acquire per-order lock to prevent race with webhook handler
  const releaseLock = await acquireOrderLock(orderId);

  try {
    const orderRepo = AppDataSource.getRepository<OrderRecord>(Order);

    const order = await orderRepo.findOneBy({ id: orderId });

    if (!order) {
      throw new ApiError(404, "Order not found");
    }

    // 🔥 Atomic idempotency: if paymentId is provided, try to claim it.
    // If the webhook already claimed it, skip all processing.
    if (paymentId) {
      const alreadyProcessed = await isPaymentAlreadyProcessed(paymentId);
      if (alreadyProcessed) {
        console.log(`⚡ Payment ${paymentId} already processed by webhook, skipping fallback`);
        return {
          orderId: order.id,
          status: order.status,
          emailSent: false,
          skippedReason: "ALREADY_PROCESSED_BY_WEBHOOK",
        };
      }
    }

    // Determine charge type based on current order state.
    // If the order is already ACTIVE, this is a renewal or duplicate.
    const wasAlreadyActive = order.status === "ACTIVE";
    const chargeType = wasAlreadyActive ? "RENEWAL" : "INITIAL";

    console.log(`📊 Fallback charge type: ${chargeType} | order.status: ${order.status}`);

    // Atomic claim — if the webhook is processing concurrently, this will fail
    if (paymentId) {
      const claimed = await claimPaymentForProcessing(paymentId, order.id, "2", chargeType);
      if (!claimed) {
        console.log(`⚡ Payment ${paymentId} already claimed, skipping fallback`);
        return {
          orderId: order.id,
          status: order.status,
          emailSent: false,
          skippedReason: "CLAIMED_BY_WEBHOOK",
        };
      }
    }

    // Update status to ACTIVE
    const updated = await updateOrderStatusById(order.id, "ACTIVE");

    // ✅ Subscription — pass the correct chargeType so renewals extend dates
    await ensureSubscriptionForOrder(updated as OrderRecord, chargeType);

    // ✅ Invoice
    const invoiceData = await getInvoiceData(updated.id);
    const invoicePath = await createInvoiceFile(invoiceData);

    await updateOrderInvoicePathById(updated.id, invoicePath);

    // Send success email only on first activation (not on renewals)
    let emailSent = false;
    if (!wasAlreadyActive) {
      emailSent = await trySendSuccessEmail(
        {
          ...invoiceData,
          order: {
            ...invoiceData.order,
            status: updated.status,
            invoice_path: invoicePath,
          },
        },
        paymentId,
        invoicePath,
      );
    } else {
      console.log("🔄 Skipping email for renewal/duplicate in fallback path");
    }

    return {
      orderId: updated.id,
      status: updated.status,
      chargeType,
      emailSent,
    };
  } finally {
    releaseLock();
  }
}



export async function getInvoiceData(orderId: string) {
  const orderRepo = AppDataSource.getRepository<OrderRecord>(Order);
  const userRepo = AppDataSource.getRepository<UserRecord>(User);
  const subscriptionRepo = AppDataSource.getRepository<SubscriptionRecord>(Subscription);

  const order = await orderRepo.findOneBy({ id: orderId });

  if (!order) {
    throw new ApiError(404, "Order not found");
  }

  const user = await userRepo.findOneBy({ id: order.user_id });

  if (!user) {
    throw new ApiError(404, "User not found for order");
  }

  const subscription = await subscriptionRepo.findOneBy({ order_id: order.id });

  if (!subscription) {
    throw new ApiError(404, "Subscription not found for order");
  }

  return { order, user, subscription };
}

// ============================================================================
// CARD UPDATE (PREAPPROVAL)
// ============================================================================

type PreapprovalFields = {
  merchant_id: string;
  return_url: string;
  cancel_url: string;
  notify_url: string;
  order_id: string;
  items: string;
  currency: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  address: string;
  city: string;
  country: string;
  hash: string;
};

type InitiateCardUpdateResponse = {
  checkoutUrl: string;
  fields: PreapprovalFields;
};

/**
 * Initiates a PayHere Preapproval request for card update.
 * Uses /pay/preapprove instead of /pay/checkout — shows card entry only, no payment.
 * PayHere does a nominal Rs.1 validation charge that is instantly refunded.
 */
export async function initiateCardUpdate(userId: number): Promise<InitiateCardUpdateResponse> {
  const orderRepo = AppDataSource.getRepository<OrderRecord>(Order);
  const userRepo = AppDataSource.getRepository<UserRecord>(User);

  const user = await userRepo.findOneBy({ id: userId });
  if (!user) throw new ApiError(404, "User not found");

  // Find the user's active order
  const orders = await orderRepo.find({
    where: { user_id: userId },
    order: { id: "DESC" } as any,
  });

  const activeOrder = orders.find((o) => o.status === "ACTIVE");
  if (!activeOrder) throw new ApiError(400, "No active subscription found");

  const merchantId = getEnv("PAYHERE_MERCHANT_ID");
  const merchantSecret = getEnv("PAYHERE_MERCHANT_SECRET");
  const currency = getEnv("CURRENCY");
  const baseFrontendUrl = getEnv("FRONTEND_BASE_URL");
  const notifyUrl = getEnv("PAYHERE_NOTIFY_URL");

  // Preapproval URL (different from checkout!)
  const basePayhereUrl = getEnv("PAYHERE_CHECKOUT_URL").replace("/pay/checkout", "");
  const preapproveUrl = `${basePayhereUrl}/pay/preapprove`;

  // Unique order_id for this preapproval. Keep the full order id so we can
  // resolve the exact subscription later when PayHere sends the notify call.
  const preapprovalOrderId = `CARD_UPDATE_${activeOrder.id}_${Date.now()}`;

  // Hash: For preapproval without amount, use default validation amount
  // LKR = 10.00, other currencies = 1.01 (as per PayHere docs)
  const validationAmount = currency === "LKR" ? "10.00" : "1.01";

  const secretHash = crypto
    .createHash("md5")
    .update(merchantSecret)
    .digest("hex")
    .toUpperCase();

  const hash = crypto
    .createHash("md5")
    .update(`${merchantId}${preapprovalOrderId}${validationAmount}${currency}${secretHash}`)
    .digest("hex")
    .toUpperCase();

  const { firstName, lastName } = splitName(user.name);

  const fields: PreapprovalFields = {
    merchant_id: merchantId,
    return_url: `${baseFrontendUrl}/dashboard?cardUpdated=true`,
    cancel_url: `${baseFrontendUrl}/dashboard?cardUpdated=false`,
    notify_url: notifyUrl,

    order_id: preapprovalOrderId,
    items: "Update Payment Card",
    currency,

    first_name: firstName,
    last_name: lastName || "N/A",
    email: user.email,
    phone: getEnv("PAYHERE_DEFAULT_PHONE"),
    address: getEnv("PAYHERE_DEFAULT_ADDRESS"),
    city: getEnv("PAYHERE_DEFAULT_CITY"),
    country: getEnv("PAYHERE_DEFAULT_COUNTRY"),

    hash,
  };

  console.log("\n=======================================================");
  console.log("📤 [PAYHERE] OUTGOING CARD UPDATE PREAPPROVAL CALL:");
  console.log("URL:", preapproveUrl);
  console.log("PAYLOAD:", JSON.stringify(fields, null, 2));
  console.log("=======================================================\n");

  return {
    checkoutUrl: preapproveUrl,
    fields,
  };
}

/**
 * Process the PayHere preapproval callback (card update).
 * Stores customer_token and card details, sends email notification.
 */
export async function processPreapprovalNotify(rawPayload: Record<string, unknown>) {
  const merchantId = getEnv("PAYHERE_MERCHANT_ID");
  const merchantSecret = getEnv("PAYHERE_MERCHANT_SECRET");

  const orderId = String(rawPayload.order_id ?? "").trim();
  const statusCode = String(rawPayload.status_code ?? "").trim();
  const customerToken = String(rawPayload.customer_token ?? "").trim();
  const cardNo = String(rawPayload.card_no ?? "").trim();
  const cardHolderName = String(rawPayload.card_holder_name ?? "").trim();
  const cardExpiry = String(rawPayload.card_expiry ?? "").trim();
  const paymentMethod = String(rawPayload.method ?? "").trim();
  const paymentId = String(rawPayload.payment_id ?? "").trim();

  console.log("🔔 PREAPPROVAL NOTIFY:", { orderId, statusCode, paymentId, cardNo, cardHolderName, paymentMethod });

  // Verify signature
  const recvMd5sig = String(rawPayload.md5sig ?? "").trim().toUpperCase();
  const payhereAmount = String(rawPayload.payhere_amount ?? "").trim();
  const payhereCurrency = String(rawPayload.payhere_currency ?? "").trim();
  const recvMerchantId = String(rawPayload.merchant_id ?? "").trim();

  if (recvMerchantId !== merchantId) {
    throw new ApiError(400, "Invalid merchant_id");
  }

  const secretHash = crypto.createHash("md5").update(merchantSecret).digest("hex").toUpperCase();
  const expectedSig = crypto
    .createHash("md5")
    .update(`${recvMerchantId}${orderId}${payhereAmount}${payhereCurrency}${statusCode}${secretHash}`)
    .digest("hex")
    .toUpperCase();

  if (recvMd5sig !== expectedSig) {
    throw new ApiError(400, "Invalid md5sig");
  }

  // Only process successful preapprovals (status_code === "2")
  if (statusCode !== "2") {
    console.log("⚠️ Preapproval not successful, status:", statusCode);
    return { success: false, statusCode };
  }

  // Extract the exact order ID from the preapproval order ID
  // Format: CARD_UPDATE_{orderId}_{timestamp}
  if (!orderId.startsWith("CARD_UPDATE_")) {
    // Not a card update preapproval, ignore
    return { success: false, message: "Not a card update preapproval" };
  }

  // Store customer_token on the user's active order
  const orderRepo = AppDataSource.getRepository<OrderRecord>(Order);
  const userRepo = AppDataSource.getRepository<UserRecord>(User);

  // Extract the original order id by removing the CARD_UPDATE_ prefix and
  // trimming the timestamp suffix that was appended during initiation.
  const encodedOrderId = orderId.replace("CARD_UPDATE_", "");
  const timestampSeparatorIndex = encodedOrderId.lastIndexOf("_");

  if (timestampSeparatorIndex === -1) {
    console.error("❌ Invalid card update order id format:", orderId);
    return { success: false, message: "Invalid card update order id format" };
  }

  const originalOrderId = encodedOrderId.slice(0, timestampSeparatorIndex);

  const matchingOrder = await orderRepo.findOneBy({ id: originalOrderId });

  if (!matchingOrder) {
    console.error("❌ No matching order found for preapproval:", orderId);
    return { success: false, message: "No matching order" };
  }

  // Store the customer token.
  // IMPORTANT: Do NOT overwrite payhere_subscription_id — that field is used
  // for RENEWAL detection and must keep the original PayHere subscription ID.
  // The customer_token from card preapproval is a different value.
  if (customerToken) {
    (matchingOrder as any).card_updated_at = new Date();
    await orderRepo.save(matchingOrder);
    console.log("✅ Customer token and update date stored for order:", matchingOrder.id);
    console.log(`ℹ️ customer_token: ${customerToken} (NOT overwriting payhere_subscription_id: ${(matchingOrder as any).payhere_subscription_id})`);

    // Save the real user update time and date persistently
    try {
      const filePath = "card-update-timestamps.json";
      let logData: Record<string, { updated: boolean; updatedAt: string; token: string }> = {};
      if (fsSync.existsSync(filePath)) {
        logData = JSON.parse(fsSync.readFileSync(filePath, "utf8"));
      }
      logData[matchingOrder.id] = {
        updated: true,
        updatedAt: new Date().toLocaleString(),
        token: customerToken,
      };
      fsSync.writeFileSync(filePath, JSON.stringify(logData, null, 2), "utf8");
      console.log("📝 Real user card update timestamp persistently recorded for order:", matchingOrder.id);
    } catch (err) {
      console.error("❌ Failed to record real card update timestamp:", err);
    }
  }

  // Send card update email notification
  const user = await userRepo.findOneBy({ id: matchingOrder.user_id });
  if (user) {
    try {
      const emailInfo = await sendCardUpdateEmail(user.email, user.name, matchingOrder.id);
      console.log("📧 Card update notification sent to", user.email, {
        messageId: emailInfo.messageId,
        accepted: emailInfo.accepted,
        rejected: emailInfo.rejected,
        response: emailInfo.response,
      });
    } catch (err) {
      console.error("❌ Failed to send card update email:", err);
    }

    // Automatically refund the validation charge (e.g. 10 LKR) if a payment_id is present
    if (paymentId) {
      console.log(`💸 Processing automatic refund for validation charge payment_id: ${paymentId}`);
      const refundSuccess = await refundPayherePayment(paymentId);

      if (refundSuccess) {
        // Only send refund email when the refund was actually processed
        try {
          await sendRefundSuccessEmail(user.email, user.name, payhereAmount || "10.00", payhereCurrency || "LKR");
          console.log("📧 Refund success email sent to", user.email);
        } catch (err) {
          console.error("❌ Failed to send refund success email:", err);
        }
      } else {
        console.log("⚠️ Refund was not processed (sandbox mode or API unavailable). No refund email sent.");
      }
    }
  }

  return {
    success: true,
    orderId: matchingOrder.id,
    cardNo,
    cardHolderName,
    cardExpiry,
    paymentMethod,
  };
}

/**
 * Cancel an active subscription in PayHere via API
 */
export async function cancelPayhereSubscription(subscriptionId: string) {
  const appId = process.env.PAYHERE_APP_ID;
  const appSecret = process.env.PAYHERE_APP_SECRET;
  const checkoutUrl = getEnv("PAYHERE_CHECKOUT_URL");

  if (!appId || !appSecret) {
    console.warn("⚠️ PAYHERE_APP_ID or PAYHERE_APP_SECRET not found in .env. Skipping PayHere API cancellation.");
    return false;
  }

  // derive base API url
  const baseUrl = checkoutUrl.includes("sandbox")
    ? "https://sandbox.payhere.lk"
    : "https://app.payhere.lk";

  try {
    // 1. Get access token
    const tokenRes = await fetch(`${baseUrl}/merchant/v1/oauth/token`, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${Buffer.from(`${appId}:${appSecret}`).toString('base64')}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: 'grant_type=client_credentials'
    });

    if (!tokenRes.ok) {
      const errText = await tokenRes.text();
      console.error("❌ PayHere Auth Failed:", errText);
      return false;
    }

    const tokenData = await tokenRes.json();
    const accessToken = tokenData.access_token;

    // 2. Call cancel API
    const cancelUrl = `${baseUrl}/merchant/v1/subscription/cancel`;
    const cancelPayload = { subscription_id: subscriptionId };

    console.log("\n=======================================================");
    console.log(`📤 [PAYHERE] OUTGOING SUBSCRIPTION CANCEL CALL for ${subscriptionId}:`);
    console.log("URL:", cancelUrl);
    console.log("PAYLOAD:", JSON.stringify(cancelPayload, null, 2));
    console.log("=======================================================\n");

    const cancelRes = await fetch(cancelUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(cancelPayload)
    });

    if (!cancelRes.ok) {
      const errText = await cancelRes.text();
      console.log("\n=======================================================");
      console.log(`📥 [PAYHERE] INCOMING SUBSCRIPTION CANCEL ERROR RESPONSE:`);
      console.log(`Status: ${cancelRes.status}`);
      console.log(`Error: ${errText}`);
      console.log("=======================================================\n");
      return false;
    }

    const cancelData = await cancelRes.json();
    console.log("\n=======================================================");
    console.log(`📥 [PAYHERE] INCOMING SUBSCRIPTION CANCEL SUCCESS RESPONSE:`);
    console.log(JSON.stringify(cancelData, null, 2));
    console.log("=======================================================\n");
    return cancelData.status === 1;

  } catch (error) {
    console.error("❌ PayHere API Error:", error);
    return false;
  }
}

/**
 * Refund a specific payment in PayHere via API
 */
export async function refundPayherePayment(paymentId: string, description = "Card validation charge automatic refund"): Promise<boolean> {
  const appId = process.env.PAYHERE_APP_ID;
  const appSecret = process.env.PAYHERE_APP_SECRET;
  const checkoutUrl = getEnv("PAYHERE_CHECKOUT_URL");
  const isSandbox = checkoutUrl.includes("sandbox");

  if (!appId || !appSecret) {
    console.warn("⚠️ PAYHERE_APP_ID or PAYHERE_APP_SECRET not found in .env. Skipping PayHere API refund.");
    return false;
  }

  if (isSandbox) {
    console.log("🧪 Running refund in SANDBOX mode — PayHere sandbox may not support refunds reliably.");
  }

  // derive base API url
  const baseUrl = checkoutUrl.includes("sandbox")
    ? "https://sandbox.payhere.lk"
    : "https://app.payhere.lk";

  try {
    // 1. Get access token
    const tokenRes = await fetch(`${baseUrl}/merchant/v1/oauth/token`, {
      method: "POST",
      headers: {
        "Authorization": `Basic ${Buffer.from(`${appId}:${appSecret}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: "grant_type=client_credentials",
    });

    if (!tokenRes.ok) {
      const errText = await tokenRes.text();
      console.error("❌ PayHere Auth Failed for refund:", errText);
      return false;
    }

    const tokenData = await tokenRes.json();
    const accessToken = tokenData.access_token;

    // 2. Call refund API
    const refundUrl = `${baseUrl}/merchant/v1/payment/refund`;
    const refundPayload = {
      payment_id: paymentId,
      description,
    };

    console.log("\n=======================================================");
    console.log(`📤 [PAYHERE] OUTGOING REFUND CALL for payment ${paymentId}:`);
    console.log("URL:", refundUrl);
    console.log("PAYLOAD:", JSON.stringify(refundPayload, null, 2));
    console.log("=======================================================\n");

    const refundRes = await fetch(refundUrl, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(refundPayload),
    });

    if (!refundRes.ok) {
      const errText = await refundRes.text();
      console.log("\n=======================================================");
      console.log(`📥 [PAYHERE] INCOMING REFUND ERROR RESPONSE:`);
      console.log(`Status: ${refundRes.status}`);
      console.log(`Error: ${errText}`);
      console.log("=======================================================\n");
      return false;
    }

    const refundData = await refundRes.json();
    console.log("\n=======================================================");
    console.log(`📥 [PAYHERE] INCOMING REFUND SUCCESS RESPONSE:`);
    console.log(JSON.stringify(refundData, null, 2));
    console.log("=======================================================\n");
    return refundData.status === 1 || refundData.status === "success" || refundData.status === true;

  } catch (error) {
    console.error("❌ PayHere Refund API Error:", error);
    return false;
  }
}


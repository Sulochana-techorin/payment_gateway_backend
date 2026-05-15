import nodemailer from "nodemailer";
import type Mail from "nodemailer/lib/mailer";

import { ApiError } from "../middleware/errorHandler";

type PaymentSuccessEmailInput = {
  to: string;
  customerName: string;
  orderId: string;
  paymentId: string | null;
  amount: string;
  currency: string;
  orderStatus: string;
  subscriptionStatus: string;
  subscriptionStartDate: Date;
  subscriptionEndDate: Date;
  invoiceUrl: string;
  invoicePath?: string;
};

function getRequiredEnv(name: string): string {
  const value = process.env[name];

  if (!value || value.trim() === "") {
    throw new ApiError(500, `Missing required environment variable: ${name}`);
  }

  return value.trim();
}

function getOptionalEnv(name: string): string | undefined {
  const value = process.env[name];

  if (!value || value.trim() === "") {
    return undefined;
  }

  return value.trim();
}

function parsePort(value: string): number {
  const port = Number.parseInt(value, 10);

  if (Number.isNaN(port) || port <= 0) {
    throw new ApiError(500, "EMAIL_PORT must be a positive integer");
  }

  return port;
}

function parseSecure(value: string | undefined): boolean {
  if (!value) {
    return false;
  }

  const normalized = value.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes";
}

function getTransporter(): nodemailer.Transporter {
  const host = getRequiredEnv("EMAIL_HOST");
  const port = parsePort(getRequiredEnv("EMAIL_PORT"));
  const user = getRequiredEnv("EMAIL_USER");
  const pass = getRequiredEnv("EMAIL_PASS");
  const secure = parseSecure(getOptionalEnv("EMAIL_SECURE"));

  return nodemailer.createTransport({
    host,
    port,
    secure,
    auth: {
      user,
      pass,
    },
    // Force IPv4 — Railway cannot reach Gmail via IPv6 (ENETUNREACH)
    family: 4,
    // Prevent SMTP from hanging — fail fast
    connectionTimeout: 10000,  // 10s to establish TCP connection
    greetingTimeout: 10000,    // 10s for SMTP greeting
    socketTimeout: 15000,      // 15s for socket inactivity
    tls: {
      rejectUnauthorized: false,
    },
  } as any);
}

export async function verifyEmailTransport() {
  const host = getRequiredEnv("EMAIL_HOST");
  const port = parsePort(getRequiredEnv("EMAIL_PORT"));
  const secure = parseSecure(getOptionalEnv("EMAIL_SECURE"));
  const user = getRequiredEnv("EMAIL_USER");

  const transporter = getTransporter();
  await transporter.verify();

  return {
    host,
    port,
    secure,
    user,
  };
}

function formatDate(date: Date): string {
  return new Date(date).toISOString();
}

export async function sendEmail(
  to: string,
  subject: string,
  text: string,
  attachments: Mail.Attachment[] = [],
) {
  const fromAddress = getRequiredEnv("EMAIL_USER");
  const transporter = getTransporter();

  const info = await transporter.sendMail({
    from: `"Payment App" <${fromAddress}>`,
    to,
    subject,
    text,
    attachments,
  });

  console.log("Email sent:", info.messageId, {
    accepted: info.accepted,
    rejected: info.rejected,
    response: info.response,
  });

  return info;
}

export async function sendPaymentSuccessEmail(input: PaymentSuccessEmailInput) {
  const attachments: Mail.Attachment[] = [];

  if (input.invoicePath) {
    attachments.push({
      filename: `invoice-${input.orderId}.pdf`,
      path: input.invoicePath,
      contentType: "application/pdf",
    });
  }

  const text = [
    `Dear Customer,`,
    "",
    "Your payment has been completed successfully.",
    "",
    "Payment Details",
    `- Order ID: ${input.orderId}`,
    // `- Payment ID: ${input.paymentId ?? "N/A"}`,
    `- Amount: ${input.amount} ${input.currency}`,
    // `- Order Status: ${input.orderStatus}`,
    "",
    "Subscription Details",
    `- Subscription Status: ${input.subscriptionStatus}`,
    `- Start Date: ${formatDate(input.subscriptionStartDate)}`,
    `- End Date: ${formatDate(input.subscriptionEndDate)}`,
    "",
    // "Invoice",
    //  `- Link: ${input.invoiceUrl}`,
    // input.invoicePath ? "- Attachment: Included" : "- Attachment: Not available",
    // "",
    "Thank you for your subscription.",
  ].join("\n");

  return sendEmail(
    input.to,
    `Payment Successful - Order ${input.orderId}`,
    text,
    attachments,
  );
}

export async function sendCardUpdateEmail(
  to: string,
  customerName: string,
  orderId: string,
) {
  const text = [
    `Dear ${customerName},`,
    "",
    "Your payment method has been updated successfully.",
    "",
    "Details:",
    `- Order ID: ${orderId}`,
    `- Date: ${new Date().toISOString()}`,
    "",
    "Your upcoming subscription charges will be applied to your new payment method.",
    "",
    "If you did not make this change, please contact support immediately.",
    "",
    "Thank you,",
    "Payment Subscription System",
  ].join("\n");

  return sendEmail(
    to,
    "Payment Method Updated Successfully",
    text,
  );
}

export async function sendPaymentFailedEmail(
  to: string,
  customerName: string,
  orderId: string,
  amount: string,
  currency: string,
  cardUpdateUrl: string,
) {
  const text = [
    `Dear ${customerName},`,
    "",
    "We were unable to process your recent subscription payment.",
    "",
    "Payment Details:",
    `- Order ID: ${orderId}`,
    `- Amount: ${amount} ${currency}`,
    `- Date: ${new Date().toISOString()}`,
    "",
    "This may be due to insufficient funds, an expired card, or a declined transaction.",
    "",
    "⚠️ Your subscription is at risk of being suspended.",
    "",
    "Please update your payment method as soon as possible to avoid any interruption to your service:",
    "",
    `👉 Update your card here: ${cardUpdateUrl}`,
    "",
    "If you have already resolved this issue, you can safely ignore this email.",
    "",
    "If you need assistance, please contact our support team.",
    "",
    "Thank you,",
    "Payment Subscription System",
  ].join("\n");

  return sendEmail(
    to,
    "⚠️ Payment Failed - Action Required",
    text,
  );
}

export async function sendRefundSuccessEmail(
  to: string,
  customerName: string,
  amount: string,
  currency: string,
) {
  const text = [
    `Dear ${customerName},`,
    "",
    `Your card validation charge of ${amount} ${currency} has been successfully refunded.`,
    "",
    "Please check your account to verify the refund.",
    "",
    "Thank you,",
    "Payment Subscription System",
  ].join("\n");

  return sendEmail(
    to,
    "Refund Successful - Card Validation Charge",
    text,
  );
}
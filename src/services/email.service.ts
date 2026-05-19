import * as brevo from "@getbrevo/brevo";

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

interface SendSmtpEmailAttachment {
  content: string;  // Base64 encoded content
  name: string;
}

function getBrevoClient(): brevo.TransactionalEmailsApi {
  const apiKey = getRequiredEnv("BREVO_API_KEY");
  
  const client = new brevo.TransactionalEmailsApi();
  client.setApiKey(brevo.TransactionalEmailsApiApiKeys.apiKey, apiKey);
  
  return client;
}

export async function verifyEmailTransport() {
  const apiKey = getRequiredEnv("BREVO_API_KEY");
  const senderEmail = getRequiredEnv("BREVO_SENDER_EMAIL");
  const senderName = getRequiredEnv("BREVO_SENDER_NAME");

  return {
    service: "Brevo",
    senderEmail,
    senderName,
    apiKeyConfigured: apiKey.length > 0,
  };
}

function formatDate(date: Date): string {
  return new Date(date).toISOString();
}

export async function sendEmail(
  to: string,
  subject: string,
  text: string,
  attachments: SendSmtpEmailAttachment[] = [],
) {
  try {
    const client = getBrevoClient();
    const senderEmail = getRequiredEnv("BREVO_SENDER_EMAIL");
    const senderName = getRequiredEnv("BREVO_SENDER_NAME");

    const sendSmtpEmail = new brevo.SendSmtpEmail();
    sendSmtpEmail.to = [{ email: to }];
    sendSmtpEmail.sender = { name: senderName, email: senderEmail };
    sendSmtpEmail.subject = subject;
    sendSmtpEmail.textContent = text;
    
    // Add attachments if provided
    if (attachments.length > 0) {
      sendSmtpEmail.attachment = attachments.map(a => ({
        name: a.name,
        content: a.content,  // Already base64 encoded from sendPaymentSuccessEmail
      }));
    }

    const response = await client.sendTransacEmail(sendSmtpEmail);
    
    console.log(`📧 [EMAIL SENT] to: ${to} | Subject: ${subject} | Message ID: ${response.body.messageId}`);
    
    return {
      messageId: response.body.messageId,
      accepted: [to],
      rejected: [],
      response: "Email sent successfully via Brevo",
    };
  } catch (error: any) {
    console.error("❌ [EMAIL ERROR]", {
      to,
      subject,
      error: error.message,
    });
    throw new ApiError(500, `Failed to send email: ${error.message}`);
  }
}

export async function sendPaymentSuccessEmail(input: PaymentSuccessEmailInput) {
  const attachments: SendSmtpEmailAttachment[] = [];

  if (input.invoicePath) {
    try {
      const fs = await import("fs").then(m => m.promises);
      const fileContent = await fs.readFile(input.invoicePath);
      attachments.push({
        content: fileContent.toString("base64"),  // Convert Buffer to base64 string
        name: `invoice-${input.orderId}.pdf`,
      });
    } catch (error) {
      console.warn(`Failed to attach invoice: ${error}`);
    }
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

export async function sendRenewalSuccessEmail(
  to: string,
  customerName: string,
  orderId: string,
  amount: string,
  currency: string,
  newEndDate: string,
) {
  const text = [
    `Dear ${customerName},`,
    "",
    "Your subscription has been renewed successfully.",
    "",
    "Renewal Details:",
    `- Order ID: ${orderId}`,
    `- Amount Charged: ${amount} ${currency}`,
    `- Renewal Date: ${new Date().toISOString()}`,
    `- Next Payment Due: ${newEndDate}`,
    "",
    "Your subscription will continue without interruption.",
    "",
    "If you have any questions, please contact our support team.",
    "",
    "Thank you,",
    "Payment Subscription System",
  ].join("\n");

  return sendEmail(
    to,
    `✅ Subscription Renewed Successfully - Order ${orderId}`,
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



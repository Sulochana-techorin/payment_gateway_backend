import PDFDocument from "pdfkit";
import { Response } from "express";
import fs from "fs/promises";
import path from "path";

import { OrderRecord, SubscriptionRecord, UserRecord } from "../types/models";

type InvoiceData = {
  order: OrderRecord;
  user: UserRecord;
  subscription: SubscriptionRecord;
};

function getInvoiceStorageDir(): string {
  const configured = process.env.INVOICE_STORAGE_DIR?.trim();

  if (configured) {
    return path.resolve(configured);
  }

  return path.resolve(process.cwd(), "invoices");
}

function drawInvoiceContent(
  doc: PDFKit.PDFDocument,
  order: OrderRecord,
  user: UserRecord,
  subscription: SubscriptionRecord,
) {
  const start = new Date(subscription.start_date).toLocaleDateString();
  const end = new Date(subscription.end_date).toLocaleDateString();
  const invoiceDate = new Date().toLocaleDateString();
  const currency = order.currency || "USD";

  // Document Settings
  doc.font("Helvetica");

  // --- Header ---
  doc.fillColor("#111827").fontSize(28).text("INVOICE", 50, 50);
  
  doc.fontSize(10).fillColor("#6B7280").text(`Invoice Number:`, 50, 90);
  doc.fillColor("#111827").text(order.id, 50, 105);
  
  doc.fillColor("#6B7280").text(`Date:`, 50, 130);
  doc.fillColor("#111827").text(invoiceDate, 50, 145);

  doc.fillColor("#6B7280").text(`Status:`, 50, 170);
  doc.fillColor(order.status === "ACTIVE" || order.status === "SUCCESS" ? "#10B981" : "#EF4444")
     .text(order.status, 50, 185);

  // --- Billed To ---
  doc.fontSize(12).fillColor("#111827").text("Billed To:", 300, 90);
  doc.fontSize(10).fillColor("#6B7280");
  doc.text(user.name, 300, 110);
  doc.text(user.email, 300, 125);
  doc.text(`Customer ID: ${user.id}`, 300, 140);

  // --- Subscription Info ---
  doc.fontSize(12).fillColor("#111827").text("Subscription Period:", 300, 170);
  doc.fontSize(10).fillColor("#6B7280");
  doc.text(`${start} - ${end}`, 300, 190);

  // --- Line Item Header ---
  const tableTop = 250;
  
  doc.rect(50, tableTop, 500, 30).fill("#F3F4F6");
  doc.fillColor("#374151").fontSize(10).font("Helvetica-Bold");
  doc.text("Description", 60, tableTop + 10);
  doc.text("Qty", 350, tableTop + 10, { width: 50, align: "center" });
  doc.text("Unit Price", 400, tableTop + 10, { width: 50, align: "right" });
  doc.text("Amount", 480, tableTop + 10, { width: 60, align: "right" });
  
  // --- Line Items ---
  doc.font("Helvetica").fillColor("#111827");
  let y = tableTop + 45;
  
  if (Number(order.base_price) > 0) {
    doc.text("Registration Fee (One-time)", 60, y);
    doc.text("1", 350, y, { width: 50, align: "center" });
    doc.text(`${Number(order.base_price).toFixed(2)}`, 400, y, { width: 50, align: "right" });
    doc.text(`${Number(order.base_price).toFixed(2)}`, 480, y, { width: 60, align: "right" });
    y += 25;
  }
  
  if (Number(order.subscription_amount) > 0) {
    doc.text("Monthly Subscription", 60, y);
    doc.text(order.user_count.toString(), 350, y, { width: 50, align: "center" });
    doc.text(`${Number(order.price_per_user).toFixed(2)}`, 400, y, { width: 50, align: "right" });
    doc.text(`${Number(order.subscription_amount).toFixed(2)}`, 480, y, { width: 60, align: "right" });
    y += 30;
  }

  doc.moveTo(50, y).lineTo(550, y).strokeColor("#E5E7EB").stroke();

  // --- Total ---
  y += 20;
  doc.font("Helvetica-Bold").fontSize(12).fillColor("#111827");
  doc.text("Total Amount:", 350, y, { width: 100, align: "right" });
  doc.fillColor("#10B981").text(`${currency} ${Number(order.total_amount).toFixed(2)}`, 460, y, { width: 80, align: "right" });

  // --- Footer ---
  doc.font("Helvetica").fontSize(10).fillColor("#9CA3AF");
  doc.text("Thank you for your business!", 50, 700, { align: "center", width: 500 });
}

export function generateInvoicePDF(
  res: Response,
  order: OrderRecord,
  user: UserRecord,
  subscription: SubscriptionRecord,
) {
  const doc = new PDFDocument();

  // set headers
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename=invoice-${order.id}.pdf`
  );

  doc.pipe(res);

  drawInvoiceContent(doc, order, user, subscription);

  doc.end();
}

export async function createInvoiceFile(data: InvoiceData): Promise<string> {
  const invoiceDir = getInvoiceStorageDir();
  await fs.mkdir(invoiceDir, { recursive: true });

  const filePath = path.join(invoiceDir, `invoice-${data.order.id}.pdf`);
  const doc = new PDFDocument();
  const chunks: Buffer[] = [];

  return new Promise<string>((resolve, reject) => {
    doc.on("data", (chunk) => chunks.push(chunk as Buffer));
    doc.on("error", reject);
    doc.on("end", async () => {
      try {
        await fs.writeFile(filePath, Buffer.concat(chunks));
        resolve(filePath);
      } catch (err) {
        reject(err);
      }
    });

    drawInvoiceContent(doc, data.order, data.user, data.subscription);
    doc.end();
  });
}
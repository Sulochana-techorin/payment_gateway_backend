export interface InitiatePaymentPayload {
  orderId: string;
}

export function validateInitiatePaymentPayload(payload: InitiatePaymentPayload): string | null {
  if (!payload.orderId || payload.orderId.trim() === "") {
    return "orderId is required";
  }

  return null;
}

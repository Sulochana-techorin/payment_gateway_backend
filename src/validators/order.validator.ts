export interface CreateOrderPayload {
  user_id: number;
  user_count?: number;
}

export function validateCreateOrderPayload(payload: CreateOrderPayload): string | null {
  if (!payload.user_id) {
    return "user_id is required";
  }

  if (payload.user_count !== undefined && payload.user_count <= 0) {
    return "user_count must be greater than 0";
  }

  return null;
}

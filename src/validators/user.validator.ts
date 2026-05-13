import validator from "validator";

export interface LoginPayload {
  customerId: number;
  email: string;
  password: string;
}

export interface UpdateProfilePayload {
  name?: string;
  email?: string;
}

export function validateLoginPayload(payload: LoginPayload): string | null {
  const { customerId, email, password } = payload;

  if (!customerId || !email || !password) {
    return "Customer ID, email, and password are required";
  }

  if (typeof customerId !== "number" || customerId <= 0) {
    return "Customer ID must be a positive number";
  }

  if (!validator.isEmail(email)) {
    return "Invalid email format";
  }

  if (password.length < 6) {
    return "Password too short";
  }

  return null;
}

export function validateUpdateProfilePayload(payload: UpdateProfilePayload): string | null {
  if (!payload.name && !payload.email) {
    return "At least one field (name or email) is required";
  }

  if (payload.email && !validator.isEmail(payload.email)) {
    return "Invalid email format";
  }

  if (payload.name && payload.name.trim().length === 0) {
    return "Name cannot be empty";
  }

  return null;
}

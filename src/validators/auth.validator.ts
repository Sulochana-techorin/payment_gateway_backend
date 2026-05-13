import validator from "validator";

export interface RegisterPayload {
  name: string;
  email: string;
  password: string;
  userCount: number;
}

export function validateRegisterPayload(payload: RegisterPayload): string | null {
  const { name, email, password, userCount } = payload;

  if (!name || !email || !password || userCount === undefined) {
    return "All fields are required";
  }

  if (!validator.isEmail(email)) {
    return "Invalid email format";
  }

  if (password.length < 6) {
    return "Password too short";
  }

  if (userCount < 0) {
    return "User count cannot be negative";
  }

  return null;
}

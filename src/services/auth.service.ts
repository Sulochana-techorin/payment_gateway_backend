import bcrypt from "bcrypt";

import { AppDataSource } from "../config/data-source";
import { User } from "../entity/user";
import { UserRecord } from "../types/models";
import { RegisterPayload } from "../validators/auth.validator";
import { LoginPayload } from "../validators/user.validator";
import { generateToken } from "../middleware/authMiddleware";
import { ApiError } from "../middleware/errorHandler";

export async function registerUser(payload: RegisterPayload): Promise<{ userId: number }> {
  const userRepo = AppDataSource.getRepository<UserRecord>(User);
  const hashedPassword = await bcrypt.hash(payload.password, 10);

  const userToCreate = userRepo.create({
    name: payload.name,
    email: payload.email,
    password: hashedPassword,
    userCount: payload.userCount,
  });

  const newUser = await userRepo.save(userToCreate);

  return {
    userId: newUser.id,
  };
}

export async function loginUser(payload: LoginPayload): Promise<{ token: string; userId: number; name: string; email: string }> {
  const userRepo = AppDataSource.getRepository<UserRecord>(User);

  // Find user by ID and email combo
  const user = await userRepo.findOneBy({ id: payload.customerId });

  if (!user) {
    throw new ApiError(401, "Invalid credentials");
  }

  if (user.email !== payload.email) {
    throw new ApiError(401, "Invalid credentials");
  }

  // Verify password
  const isPasswordValid = await bcrypt.compare(payload.password, user.password);

  if (!isPasswordValid) {
    throw new ApiError(401, "Invalid credentials");
  }

  // Generate JWT
  const token = generateToken({
    userId: user.id,
    email: user.email,
  });

  return {
    token,
    userId: user.id,
    name: user.name,
    email: user.email,
  };
}

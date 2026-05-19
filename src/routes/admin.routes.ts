import { Router } from "express";
import { asyncHandler } from "../middleware/asyncHandler";
import { getAllPayments, getAllUsers, getUserTrackingDetails, adminCancelSubscription } from "../controllers/admin.controller";

const adminRouter = Router();

// GET /api/admin/payments  — list all orders/payments
adminRouter.get("/api/admin/payments", asyncHandler(getAllPayments));

// GET /api/admin/users  — list all users
adminRouter.get("/api/admin/users", asyncHandler(getAllUsers));

// GET /api/admin/user-tracking/:userId — get comprehensive tracking details per user/order
adminRouter.get("/api/admin/user-tracking/:userId", asyncHandler(getUserTrackingDetails));

// POST /api/admin/cancel-subscription - cancel active subscription
adminRouter.post("/api/admin/cancel-subscription", asyncHandler(adminCancelSubscription));

export { adminRouter };

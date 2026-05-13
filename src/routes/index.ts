import { Router } from "express";

import { authRouter } from "./auth.routes";
import { orderRouter } from "./order.routes";
import { paymentRouter } from "./payment.routes";
import { pricingRouter } from "./pricing.routes";
import { adminRouter } from "./admin.routes";
import { userRouter } from "./user.routes";
const apiRouter = Router();

apiRouter.use(pricingRouter);
apiRouter.use("/api/auth", authRouter);
apiRouter.use(orderRouter);
apiRouter.use(paymentRouter);
apiRouter.use(adminRouter);
apiRouter.use(userRouter);

export { apiRouter };

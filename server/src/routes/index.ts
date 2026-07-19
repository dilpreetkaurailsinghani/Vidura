import { Router } from "express";
import chatRoutes from "./chat.routes";
import reportRoutes from "./report.routes";
import marketRoutes from "./market.routes";
import healthRoutes from "./health.routes";

const router = Router();

router.use("/health", healthRoutes);
router.use("/chat", chatRoutes);
router.use("/report", reportRoutes);
router.use("/market-data", marketRoutes);

export default router;

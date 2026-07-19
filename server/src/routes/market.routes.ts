import { Router } from "express";
import { getMarketData } from "../controllers/market.controller";
import { marketDataValidators } from "../validators/market.validator";
import { validate } from "../middleware/validate";
import { asyncHandler } from "../utils/asyncHandler";

const router = Router();

router.get("/:ticker", validate(marketDataValidators), asyncHandler(getMarketData));

export default router;

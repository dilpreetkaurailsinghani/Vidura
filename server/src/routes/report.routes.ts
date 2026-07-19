import { Router } from "express";
import { postReport } from "../controllers/report.controller";
import { reportValidators } from "../validators/report.validator";
import { validate } from "../middleware/validate";
import { asyncHandler } from "../utils/asyncHandler";
import { aiRateLimiter } from "../middleware/rateLimiter";

const router = Router();

router.post("/", aiRateLimiter, validate(reportValidators), asyncHandler(postReport));

export default router;

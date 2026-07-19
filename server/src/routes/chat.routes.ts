import { Router } from "express";
import { postChat } from "../controllers/chat.controller";
import { chatValidators } from "../validators/chat.validator";
import { validate } from "../middleware/validate";
import { asyncHandler } from "../utils/asyncHandler";
import { aiRateLimiter } from "../middleware/rateLimiter";

const router = Router();

router.post("/", aiRateLimiter, validate(chatValidators), asyncHandler(postChat));

export default router;

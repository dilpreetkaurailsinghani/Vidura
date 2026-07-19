import { body, type ValidationChain } from "express-validator";

// Valid roles according to the Vercel AI SDK UIMessage schema.
const VALID_ROLES = ["user", "assistant", "system", "tool"];

export const chatValidators: ValidationChain[] = [
  // Top-level messages array
  body("messages")
    .isArray({ min: 1 })
    .withMessage("messages must be a non-empty array"),

  // Each message must have a valid role string
  body("messages.*.role")
    .exists({ checkNull: true })
    .withMessage("each message must have a role")
    .isString()
    .withMessage("message role must be a string")
    .isIn(VALID_ROLES)
    .withMessage(`message role must be one of: ${VALID_ROLES.join(", ")}`),

  // Each message must have a content field that is either a string or an array
  // (the Vercel AI SDK UIMessage format uses content: string | ContentPart[])
  body("messages.*.content")
    .exists({ checkNull: true })
    .withMessage("each message must have a content field")
    .custom((value) => {
      if (typeof value === "string") return true;
      if (Array.isArray(value)) {
        // Each content part must be an object with a type field
        for (const part of value) {
          if (typeof part !== "object" || part === null || typeof part.type !== "string") {
            throw new Error("each content part must be an object with a type string");
          }
        }
        return true;
      }
      throw new Error("content must be a string or an array of content parts");
    }),

  // Optional ticker for company context
  body("ticker")
    .optional({ nullable: true })
    .isString()
    .trim()
    .isLength({ min: 1, max: 20 })
    .withMessage("ticker must be a short string when provided"),
];

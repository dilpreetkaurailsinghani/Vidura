import type { Request, Response } from "express";
import { generateText } from "ai";
import { env, getAiGatewayApiKey } from "../config/env";
import { createLovableAiGatewayProvider } from "../services/ai-gateway.service";
import { buildReportContext, REPORT_SYSTEM_PROMPT } from "../services/research-context.service";

export async function postReport(req: Request, res: Response): Promise<void> {
  const apiKey = getAiGatewayApiKey();
  if (!apiKey) {
    res.status(500).json({ error: "Missing LOVABLE_API_KEY" });
    return;
  }

  const { ticker } = req.body as { ticker: string };

  // Throws HttpError(404) if not found; caught by the async error handler
  // via asyncHandler in the route definition.
  const { context } = buildReportContext(ticker);

  const gateway = createLovableAiGatewayProvider(apiKey);
  const { text } = await generateText({
    model: gateway(env.aiModel),
    system: REPORT_SYSTEM_PROMPT,
    prompt: `Write the research note for the following company. Use only the data below.\n\n${context}`,
  });

  res.status(200).json({ markdown: text });
}

import type { Request, Response } from "express";
import { Readable } from "node:stream";
import { convertToModelMessages, streamText, type UIMessage } from "ai";
import { env, getAiGatewayApiKey } from "../config/env";
import { createLovableAiGatewayProvider } from "../services/ai-gateway.service";
import { buildCompanyContext, CHAT_SYSTEM_PROMPT_PREFIX } from "../services/research-context.service";
import { logger } from "../utils/logger";

export async function postChat(req: Request, res: Response): Promise<void> {
  const apiKey = getAiGatewayApiKey();
  if (!apiKey) {
    res.status(500).json({ error: "Missing LOVABLE_API_KEY" });
    return;
  }

  const { messages, ticker } = req.body as { messages: UIMessage[]; ticker?: string };

  const ctx = ticker ? buildCompanyContext(ticker) : "No company context available.";
  const gateway = createLovableAiGatewayProvider(apiKey);
  const system = `${CHAT_SYSTEM_PROMPT_PREFIX}${ctx}`;

  const result = streamText({
    model: gateway(env.aiModel),
    system,
    messages: await convertToModelMessages(messages),
  });

  // result.toUIMessageStreamResponse() returns a standard web Response
  // (as used by Vercel AI SDK / TanStack Start). Express works with the
  // Node http.ServerResponse, so we bridge the two: copy status/headers,
  // then pipe the web ReadableStream body into the Node response stream.
  const streamResponse = result.toUIMessageStreamResponse();

  res.status(streamResponse.status);
  streamResponse.headers.forEach((value, key) => {
    // Content-Length doesn't apply to a chunked/streamed body.
    if (key.toLowerCase() === "content-length") return;
    res.setHeader(key, value);
  });

  if (!streamResponse.body) {
    res.end();
    return;
  }

  const nodeStream = Readable.fromWeb(streamResponse.body as import("node:stream/web").ReadableStream);

  nodeStream.on("error", (err) => {
    logger.error("chat stream error", err);
    if (!res.writableEnded) res.end();
  });

  req.on("close", () => {
    // If the client disconnects, stop reading from the upstream stream.
    if (!nodeStream.destroyed) nodeStream.destroy();
  });

  nodeStream.pipe(res);
}

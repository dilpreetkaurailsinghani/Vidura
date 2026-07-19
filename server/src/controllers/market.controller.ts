import type { Request, Response } from "express";
import { getLiveQuote } from "../services/market-data.service";

export async function getMarketData(req: Request, res: Response): Promise<void> {
  const { ticker } = req.params;
  const result = await getLiveQuote(ticker);
  res.status(200).json(result);
}

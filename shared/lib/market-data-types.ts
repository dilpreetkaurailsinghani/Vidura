/**
 * Shared market-data type definitions.
 * Single source of truth — imported by both the server (market-data.service.ts)
 * and the client (lib/market-data.ts) to prevent type drift.
 */

/**
 * Live market data for a single company fetched from Yahoo Finance.
 * All fields are optional because the scraping is best-effort; any field
 * missing from the API response is simply omitted rather than defaulted.
 */
export type LiveQuote = Partial<{
  cmp: number;
  previousClose: number;
  open: number;
  high: number;
  low: number;
  volume: number;
  marketCap: number;         // ₹ Cr
  enterpriseValue: number;   // ₹ Cr (approx)
  pe: number;
  pb: number;
  eps: number;
  dividendYield: number;     // %
  sharesOutstanding: number; // Cr
  currency: string;
  exchange: string;
  evEbitda: number;
  roe: number;               // %
  debtEquity: number;
  netDebt: number;           // ₹ Cr
  fcfYield: number;          // %
}>;

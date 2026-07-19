// Reusable KPI/ratio calculation module.
// Historical 3-statement rows (₹ Cr, shares in Cr) are the single source of truth.
// Yahoo Finance is used ONLY for CMP, market cap, shares outstanding, beta.

import type { Company, FYRow } from "../data/companies";
import {
  buildIncome, buildBalance, buildCashFlow,
  type IncomeRow, type BalanceRow, type CashFlowRow,
} from "./financials";

export type LiveMarket = Partial<{
  cmp: number;               // ₹ / share
  marketCap: number;         // ₹ Cr
  sharesOutstanding: number; // Cr shares
  beta: number;
}>;

export type ComputedKPIs = {
  // margins
  grossMargin?: number;      // %
  ebitdaMargin?: number;     // %
  ebitMargin?: number;       // %
  netMargin?: number;        // %
  // returns / leverage / liquidity / efficiency
  roe?: number;              // %
  roce?: number;             // %
  debtEquity?: number;
  currentRatio?: number;
  assetTurnover?: number;
  interestCoverage?: number;
  // cash
  freeCashFlow?: number;     // ₹ Cr
  fcfMargin?: number;        // %
  netDebt?: number;          // ₹ Cr
  // market-linked (need live market cap / cmp)
  marketCap?: number;        // ₹ Cr
  enterpriseValue?: number;  // ₹ Cr
  evEbitda?: number;
  pe?: number;
  pb?: number;
  fcfYield?: number;         // %
  eps?: number;              // ₹ / share
};

const safe = (n: number) => (isFinite(n) ? n : undefined);
const div = (a: number, b: number) => (b !== 0 && isFinite(a) && isFinite(b) ? a / b : undefined);

/**
 * Compute all KPIs from historical statements + optional live market fields.
 * Everything derived from statements. Only market-linked ratios (EV, PE, PB,
 * FCF Yield, EV/EBITDA, Market Cap) require live inputs.
 */
export function computeKPIs(c: Company, live: LiveMarket = {}): ComputedKPIs {
  const history: FYRow[] = c.history;
  const inc: IncomeRow[] = buildIncome(history, history[history.length - 1].shares);
  const bal: BalanceRow[] = buildBalance(history);
  const cf: CashFlowRow[] = buildCashFlow(history, inc);

  const i = inc[inc.length - 1];
  const b = bal[bal.length - 1];
  const f = cf[cf.length - 1];
  const raw = history[history.length - 1];

  const totalDebt = raw.longDebt + raw.shortDebt;
  const capitalEmployed = b.equity + totalDebt;
  const netDebt = totalDebt - raw.cash;

  const grossMargin  = pct(div(i.grossProfit, i.revenue));
  const ebitdaMargin = pct(div(i.ebitda, i.revenue));
  const ebitMargin   = pct(div(i.ebit, i.revenue));
  const netMargin    = pct(div(i.pat, i.revenue));
  const roe          = pct(div(i.pat, b.equity));
  const roce         = pct(div(i.ebit, capitalEmployed));
  const debtEquity   = safe(div(totalDebt, b.equity) ?? NaN);
  const currentRatio = safe(div(b.currentAssets, b.currentLiabilities) ?? NaN);
  const assetTurnover = safe(div(i.revenue, b.totalAssets) ?? NaN);
  const interestCoverage = i.interest > 0 ? safe(i.ebit / i.interest) : undefined;
  const freeCashFlow = safe(f.fcf);
  const fcfMargin    = pct(div(f.fcf, i.revenue));

  // Market-linked. Prefer live market cap; fall back to CMP × shares.
  const shares = live.sharesOutstanding ?? raw.shares;
  const marketCap =
    live.marketCap ??
    (live.cmp !== undefined && shares ? live.cmp * shares : undefined);
  const enterpriseValue =
    marketCap !== undefined ? marketCap + netDebt : undefined;
  const evEbitda = enterpriseValue !== undefined ? safe(enterpriseValue / i.ebitda) : undefined;
  const eps = shares ? safe(i.pat / shares) : undefined;
  const pe = live.cmp !== undefined && eps ? safe(live.cmp / eps) : undefined;
  const pb = marketCap !== undefined ? safe(marketCap / b.equity) : undefined;
  const fcfYield =
    marketCap !== undefined && marketCap > 0 && freeCashFlow !== undefined
      ? pct(freeCashFlow / marketCap)
      : undefined;

  return {
    grossMargin, ebitdaMargin, ebitMargin, netMargin,
    roe, roce, debtEquity, currentRatio, assetTurnover, interestCoverage,
    freeCashFlow, fcfMargin, netDebt: safe(netDebt),
    marketCap, enterpriseValue, evEbitda, pe, pb, fcfYield, eps,
  };
}

function pct(r: number | undefined): number | undefined {
  return r === undefined || !isFinite(r) ? undefined : r * 100;
}

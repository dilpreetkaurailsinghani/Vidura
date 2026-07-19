import { resolveCompany } from "@shared/data/universe";
import {
  buildIncome,
  buildBalance,
  buildCashFlow,
  buildRatios,
  defaultForecast,
  projectForecast,
  defaultDCFInputs,
  runDCF,
  relativeValuation,
} from "@shared/lib/financials";
import { HttpError } from "../utils/httpError";

// ---------------------------------------------------------------------------
// Private shared computation helper (Fix 13: eliminates duplicate logic)
// ---------------------------------------------------------------------------
// Both buildCompanyContext and buildReportContext previously ran the same
// 9-step financial computation chain independently. This helper centralises
// that chain so changes only need to be made in one place.

function computeResearchData(c: NonNullable<ReturnType<typeof resolveCompany>>) {
  const inc = buildIncome(c.history, c.history[c.history.length - 1].shares);
  const bal = buildBalance(c.history);
  const cf = buildCashFlow(c.history, inc);
  const ratios = buildRatios(inc, bal, c.history);
  const f = defaultForecast(c);
  const fc = projectForecast(c, f);
  const dcf = runDCF(c, fc, defaultDCFInputs(c));
  const rel = relativeValuation(c);
  const last = inc[inc.length - 1];
  return { inc, bal, cf, ratios, f, fc, dcf, rel, last };
}

/**
 * Builds the verbose, chat-oriented context string used to ground the
 * AI Analyst conversation. Identical to the original api/chat.ts
 * companyContext() helper.
 */
export function buildCompanyContext(ticker: string): string {
  const c = resolveCompany(ticker);
  if (!c) return "No company context available.";

  const { inc, cf, ratios, f, dcf, rel, last } = computeResearchData(c);

  return [
    `Company: ${c.name} (NSE:${c.ticker}${c.bse ? ` / BSE:${c.bse}` : ""})`,
    `Sector: ${c.sector} | Industry: ${c.industry}`,
    `Description: ${c.description}`,
    `CMP: ₹${c.cmp} | MCap: ₹${(rel.marketCap / 1e5).toFixed(2)} L Cr | EV: ₹${(rel.enterpriseValue / 1e5).toFixed(2)} L Cr`,
    `Multiples: PE ${rel.pe.toFixed(1)}x, PB ${rel.pb.toFixed(1)}x, EV/EBITDA ${rel.evEbitda.toFixed(1)}x`,
    `DCF: WACC ${(dcf.wacc * 100).toFixed(2)}%, Intrinsic ₹${dcf.intrinsicPrice.toFixed(0)} (${(dcf.upside * 100).toFixed(1)}% vs CMP)`,
    `Last FY (${last.year}): Revenue ₹${last.revenue.toFixed(0)} Cr | EBITDA margin ${((last.ebitda / last.revenue) * 100).toFixed(1)}% | PAT ₹${last.pat.toFixed(0)} Cr | EPS ₹${last.eps.toFixed(1)}`,
    `Historical income (₹ Cr):\n${inc.map((r) => `  ${r.year}: Rev ${r.revenue.toFixed(0)}, EBITDA ${r.ebitda.toFixed(0)}, PAT ${r.pat.toFixed(0)}, EPS ${r.eps.toFixed(2)}`).join("\n")}`,
    `Cash flows (₹ Cr):\n${cf.map((r) => `  ${r.year}: CFO ${r.cfo.toFixed(0)}, Capex ${r.capex.toFixed(0)}, FCF ${r.fcf.toFixed(0)}`).join("\n")}`,
    `Key ratios:\n${ratios.map((r) => `  ${r.year}: ROE ${(r.roe * 100).toFixed(1)}%, ROCE ${(r.roce * 100).toFixed(1)}%, D/E ${r.debtEquity.toFixed(2)}`).join("\n")}`,
    `Forecast assumptions: revenue growth ${f.revenueGrowth.toFixed(1)}%, EBITDA margin ${f.ebitdaMargin.toFixed(1)}%, capex/sales ${f.capexPctRevenue.toFixed(1)}%`,
    `Peers: ${c.peers.join(", ")}`,
  ].join("\n");
}

/**
 * Builds the more compact context string used to seed the full research
 * report generation. Identical to the original api/report.ts inline
 * context construction. Throws HttpError(404) if the ticker isn't in
 * the seeded universe, matching the original behavior.
 */
export function buildReportContext(ticker: string): { name: string; ticker: string; context: string } {
  const c = resolveCompany(ticker);
  if (!c) {
    throw new HttpError(404, "Company not found");
  }

  const { inc, cf, ratios, f, dcf, rel, last } = computeResearchData(c);

  const context = [
    `${c.name} (NSE:${c.ticker}) — ${c.sector} / ${c.industry}`,
    c.description,
    `CMP ₹${c.cmp}, MCap ₹${(rel.marketCap / 1e5).toFixed(2)} L Cr, EV ₹${(rel.enterpriseValue / 1e5).toFixed(2)} L Cr`,
    `Multiples: PE ${rel.pe.toFixed(1)}x, PB ${rel.pb.toFixed(1)}x, EV/EBITDA ${rel.evEbitda.toFixed(1)}x`,
    `5Y revenue CAGR ${(((last.revenue / inc[0].revenue) ** (1 / (inc.length - 1)) - 1) * 100).toFixed(1)}%`,
    `Latest FY (${last.year}): Revenue ₹${last.revenue.toFixed(0)} Cr, EBITDA margin ${((last.ebitda / last.revenue) * 100).toFixed(1)}%, PAT ₹${last.pat.toFixed(0)} Cr, EPS ₹${last.eps.toFixed(1)}`,
    `Latest ratios: ROE ${(ratios[ratios.length - 1].roe * 100).toFixed(1)}%, ROCE ${(ratios[ratios.length - 1].roce * 100).toFixed(1)}%, D/E ${ratios[ratios.length - 1].debtEquity.toFixed(2)}`,
    `FCF trend: ${cf.map((x) => `${x.year} ₹${x.fcf.toFixed(0)} Cr`).join(", ")}`,
    `Forecast: ${f.revenueGrowth.toFixed(1)}% revenue growth, ${f.ebitdaMargin.toFixed(1)}% EBITDA margin, ${f.years}y horizon`,
    `DCF: WACC ${(dcf.wacc * 100).toFixed(2)}%, terminal growth 4.5%, intrinsic ₹${dcf.intrinsicPrice.toFixed(0)} → ${(dcf.upside * 100).toFixed(1)}% upside vs CMP`,
    `Peers: ${c.peers.join(", ")}`,
  ].join("\n");

  return { name: c.name, ticker: c.ticker, context };
}

export const REPORT_SYSTEM_PROMPT = `You write institutional-grade Indian equity research reports. Output strict markdown with these H2 sections in this order:\n## Business Overview\n## Industry & Competitive Positioning\n## Management & Strategy\n## Financial Analysis\n## Key Ratios\n## Strengths\n## Weaknesses\n## Opportunities\n## Risks\n## Valuation Summary\n## Investment Thesis\n### Bull Case\n### Base Case\n### Bear Case\n## Target Price & Recommendation\n\nUse bullet points where natural. Quote concrete numbers (₹ Cr, %, x). End with a clear BUY / HOLD / SELL recommendation, a 12-month target price, and a one-line disclaimer that this is generated from seeded data and not investment advice.`;

export const CHAT_SYSTEM_PROMPT_PREFIX = `You are an institutional-grade Indian equity analyst. Use only the data provided as context. Be quantitative, cite figures (with units like ₹ Cr or %), and structure answers with short sections or bullets. When asked about valuation, mention DCF intrinsic vs CMP and margin of safety. Always note that this is seeded research data, not live market data, and not investment advice.\n\n--- COMPANY CONTEXT ---\n`;

// Full NSE EQ universe (~2,100 listed companies). Prototype data only.
// Source: archives.nseindia.com/content/equities/EQUITY_L.csv (downloaded at build time).
// Names/tickers are real; financials are synthesized deterministically from the ticker hash.

import raw from "./nse-list.json";
import { COMPANIES, type Company, type FYRow } from "./companies";

export type UniverseEntry = { ticker: string; name: string; isin: string };

export const UNIVERSE: UniverseEntry[] = (raw as { t: string; n: string; i: string }[]).map(
  (r) => ({ ticker: r.t, name: r.n, isin: r.i }),
);

const SEEDED = new Map(COMPANIES.map((c) => [c.ticker, c]));

// Cheap deterministic hash → seeded PRNG so each ticker always synthesizes the same numbers.
function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
function rng(seed: number) {
  let s = seed || 1;
  return () => {
    s = Math.imul(s ^ (s >>> 15), 2246822507);
    s = Math.imul(s ^ (s >>> 13), 3266489909);
    s ^= s >>> 16;
    return (s >>> 0) / 4294967296;
  };
}

const SECTORS = [
  ["Information Technology", "IT Services"],
  ["Financials", "Banks & NBFC"],
  ["Consumer Staples", "FMCG"],
  ["Consumer Discretionary", "Auto / Retail"],
  ["Industrials", "Capital Goods"],
  ["Materials", "Metals & Mining"],
  ["Materials", "Cement & Chemicals"],
  ["Energy", "Oil, Gas & Power"],
  ["Healthcare", "Pharma & Hospitals"],
  ["Communication Services", "Media & Telecom"],
  ["Real Estate", "Realty & Infra"],
  ["Utilities", "Power & Utilities"],
];

export function synthesizeCompany(entry: UniverseEntry): Company {
  const seed = hash(entry.ticker);
  const r = rng(seed);
  const [sector, industry] = SECTORS[seed % SECTORS.length];
  const isBank = industry === "Banks & NBFC";

  // Scale: micro/small/mid/large bucket based on ticker hash.
  const scaleBucket = r();
  const scale =
    scaleBucket < 0.55 ? 1 + r() * 8 : // small cap: 1-9
    scaleBucket < 0.85 ? 10 + r() * 90 : // mid cap: 10-100
    100 + r() * 900; // large cap: 100-1000

  // Anchor FY24 values (₹ Cr) at given scale.
  const revenue = Math.round(scale * (800 + r() * 1200));
  const grossMargin = 0.22 + r() * 0.35;
  const opexPct = 0.08 + r() * 0.12;
  const cogs = Math.round(revenue * (1 - grossMargin));
  const opex = Math.round(revenue * opexPct);
  const da = Math.round(revenue * (0.03 + r() * 0.05));
  const interest = Math.round(revenue * (0.01 + r() * 0.04));
  const otherIncome = Math.round(revenue * (0.005 + r() * 0.02));
  const ebit = revenue - cogs - opex - da;
  const pbt = ebit - interest + otherIncome;
  const tax = Math.round(Math.max(0, pbt) * 0.255);

  const shares = Math.max(5, Math.round(scale * (2 + r() * 6)));
  const cmp = Math.round(20 + r() * 3000);

  const ppe = Math.round(revenue * (0.4 + r() * 0.8));
  const equity = Math.round(revenue * (0.5 + r() * 1.2));
  const longDebt = Math.round(revenue * (0.1 + r() * 0.6));
  const cash = Math.round(revenue * (0.05 + r() * 0.2));

  const anchor: Omit<FYRow, "year"> = {
    revenue, cogs, opex, da, interest, otherIncome, tax,
    cash, receivables: Math.round(revenue * (0.08 + r() * 0.15)),
    inventory: isBank ? 0 : Math.round(revenue * (0.05 + r() * 0.18)),
    otherCA: Math.round(revenue * (0.05 + r() * 0.12)),
    ppe, otherNCA: Math.round(revenue * (0.15 + r() * 0.3)),
    payables: Math.round(revenue * (0.06 + r() * 0.12)),
    shortDebt: Math.round(longDebt * (0.2 + r() * 0.4)),
    otherCL: Math.round(revenue * (0.08 + r() * 0.15)),
    longDebt, otherNCL: Math.round(revenue * (0.03 + r() * 0.1)),
    equity,
    capex: Math.round(ppe * (0.08 + r() * 0.12)),
    dividends: Math.round(Math.max(0, pbt - tax) * (0.1 + r() * 0.3)),
    shares,
  };

  const growths = [
    Math.round((r() * 20 - 2) * 10) / 10,
    Math.round((r() * 22 - 2) * 10) / 10,
    Math.round((r() * 25 - 4) * 10) / 10,
    Math.round((r() * 18) * 10) / 10,
    Math.round((r() * 15 + 2) * 10) / 10,
  ];

  const years = ["FY20", "FY21", "FY22", "FY23", "FY24"];
  const history: FYRow[] = [{ year: "FY24", ...anchor }];
  let prev = anchor;
  for (let i = 0; i < 4; i++) {
    const g = 1 + growths[i] / 100;
    const row: Omit<FYRow, "year"> = {
      revenue: prev.revenue / g, cogs: prev.cogs / g, opex: prev.opex / g,
      da: prev.da / g, interest: prev.interest / g, otherIncome: prev.otherIncome / g,
      tax: prev.tax / g,
      cash: prev.cash / g, receivables: prev.receivables / g,
      inventory: prev.inventory / g, otherCA: prev.otherCA / g,
      ppe: prev.ppe / g, otherNCA: prev.otherNCA / g,
      payables: prev.payables / g, shortDebt: prev.shortDebt / g,
      otherCL: prev.otherCL / g, longDebt: prev.longDebt / g,
      otherNCL: prev.otherNCL / g, equity: prev.equity / g,
      capex: prev.capex / g, dividends: prev.dividends / g, shares: prev.shares,
    };
    history.unshift({ year: years[3 - i], ...row });
    prev = row;
  }

  return {
    ticker: entry.ticker,
    name: entry.name,
    sector, industry,
    description: `${entry.name} (NSE: ${entry.ticker}, ISIN ${entry.isin}) is a listed Indian ${industry.toLowerCase()} company. Financials shown are synthesized for prototype demonstration and are not real reported figures.`,
    cmp, beta: 0.6 + r() * 0.9,
    taxRate: 0.255, costOfDebt: 0.07 + r() * 0.03,
    riskFreeRate: 0.072, marketRiskPremium: 0.065,
    history, peers: [],
  };
}

const LIVE_OVERRIDES = new Map<string, Partial<Company>>();

/** Merge server-fetched live market data (Yahoo Finance) into a synthesized Company.
 *  Only whitelisted fields are overridden; missing fields keep the synthesized fallback. */
export function applyLiveOverride(ticker: string, patch: Partial<Company>) {
  const s = ticker.trim().toUpperCase();
  if (!s) return;
  const prev = LIVE_OVERRIDES.get(s) ?? {};
  LIVE_OVERRIDES.set(s, { ...prev, ...patch });
}

export function resolveCompany(q: string): Company | undefined {
  const s = q.trim().toUpperCase();
  if (!s) return undefined;
  const base =
    SEEDED.get(s) ??
    (() => {
      const entry =
        UNIVERSE.find((u) => u.ticker === s) ??
        UNIVERSE.find((u) => u.name.toUpperCase() === s);
      return entry ? synthesizeCompany(entry) : undefined;
    })();
  if (!base) return undefined;
  const live = LIVE_OVERRIDES.get(s);
  return live ? { ...base, ...live } : base;
}

export function searchUniverse(q: string, limit = 10): UniverseEntry[] {
  const s = q.trim().toUpperCase();
  if (!s) return [];
  const starts: UniverseEntry[] = [];
  const contains: UniverseEntry[] = [];
  for (const u of UNIVERSE) {
    if (u.ticker.startsWith(s) || u.name.toUpperCase().startsWith(s)) starts.push(u);
    else if (u.name.toUpperCase().includes(s) || u.ticker.includes(s)) contains.push(u);
    if (starts.length >= limit) break;
  }
  return [...starts, ...contains].slice(0, limit);
}

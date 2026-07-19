import NodeCache from "node-cache";
import type { Company } from "@shared/data/companies";
import { env } from "../config/env";
import { logger } from "../utils/logger";
// Single source of truth — type is defined in shared and re-exported here
// so existing imports of LiveQuote from this module continue to work.
export type { LiveQuote } from "@shared/lib/market-data-types";
import type { LiveQuote } from "@shared/lib/market-data-types";

/**
 * Centralized market-data service.
 *
 * - Fetches from Yahoo Finance server-side only.
 * - Retries transiently-failing requests up to FETCH_MAX_RETRIES times
 *   with exponential back-off (Fix 17).
 * - Cached per ticker via node-cache (TTL configurable via
 *   MARKET_DATA_CACHE_TTL_MS, default 5 minutes).
 * - Returns a partial LiveQuote; any missing field is filled by the existing
 *   synthesized/local value at read-time via applyLiveOverride -> resolveCompany
 *   on the client.
 * - Includes a `stale: boolean` flag in the response so the client can
 *   display a "live data unavailable" indicator (Fix 17).
 * - Never throws to the caller.
 */

const cache = new NodeCache({
  stdTTL: Math.floor(env.marketDataCacheTtlMs / 1000),
  checkperiod: Math.max(30, Math.floor(env.marketDataCacheTtlMs / 1000 / 2)),
});

// Yahoo symbol suffix: prefer NSE; if that fails, try BSE.
const CANDIDATE_SUFFIXES = [".NS", ".BO"];

// Retry configuration for transient Yahoo Finance failures.
const FETCH_MAX_RETRIES = 2;
const FETCH_RETRY_BASE_DELAY_MS = 400; // doubles each attempt: 400 → 800

// ---------------------------------------------------------------------------
// Retry helper
// ---------------------------------------------------------------------------

async function withRetry<T>(
  fn: () => Promise<T>,
  retries: number,
  baseDelayMs: number,
  label: string,
): Promise<T> {
  let attempt = 0;
  while (true) {
    try {
      return await fn();
    } catch (err) {
      attempt++;
      if (attempt > retries) throw err;
      const delay = baseDelayMs * Math.pow(2, attempt - 1);
      logger.debug(`market-data: ${label} attempt ${attempt} failed, retrying in ${delay}ms`, err);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
}

// ---------------------------------------------------------------------------
// Yahoo Finance fetchers
// ---------------------------------------------------------------------------

async function fetchChart(symbol: string): Promise<LiveQuote> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=5d`;
  const res = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
      Accept: "application/json",
    },
  });
  // 429 = rate limited — treat as transient; throw so withRetry backs off.
  if (res.status === 429) throw new Error(`Yahoo rate-limited: ${symbol}`);
  if (!res.ok) return {};
  const json = (await res.json()) as any;
  const result = json?.chart?.result?.[0];
  const meta = result?.meta;
  if (!meta) return {};
  return {
    cmp: numOrUndef(meta.regularMarketPrice),
    previousClose: numOrUndef(meta.chartPreviousClose ?? meta.previousClose),
    open: numOrUndef(meta.regularMarketOpen),
    high: numOrUndef(meta.regularMarketDayHigh),
    low: numOrUndef(meta.regularMarketDayLow),
    volume: numOrUndef(meta.regularMarketVolume),
    currency: meta.currency,
    exchange: meta.exchangeName,
  };
}

async function fetchQuoteSummary(symbol: string): Promise<LiveQuote> {
  // quoteSummary usually needs cookie+crumb; try best-effort, tolerate failure.
  const modules = ["price", "summaryDetail", "defaultKeyStatistics", "financialData"].join(",");
  const url = `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(symbol)}?modules=${modules}`;
  const res = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
      Accept: "application/json",
    },
  });
  if (res.status === 429) throw new Error(`Yahoo rate-limited: ${symbol}`);
  if (!res.ok) return {};
  const json = (await res.json()) as any;
  const r = json?.quoteSummary?.result?.[0];
  if (!r) return {};
  const price = r.price ?? {};
  const sd = r.summaryDetail ?? {};
  const ks = r.defaultKeyStatistics ?? {};
  const fd = r.financialData ?? {};
  const raw = (x: any) => (x && typeof x === "object" ? numOrUndef(x.raw) : numOrUndef(x));
  const mcapAbs = raw(price.marketCap);
  const evAbs = raw(ks.enterpriseValue);
  const shares = raw(ks.sharesOutstanding);
  const div = raw(sd.dividendYield);
  const roeRaw = raw(fd.returnOnEquity);
  const deRaw = raw(fd.debtToEquity);
  const fcfAbs = raw(fd.freeCashflow);
  const totalDebtAbs = raw(fd.totalDebt);
  const totalCashAbs = raw(fd.totalCash);
  const netDebtCr =
    totalDebtAbs !== undefined && totalCashAbs !== undefined ? (totalDebtAbs - totalCashAbs) / 1e7 : undefined;
  const fcfYield =
    fcfAbs !== undefined && mcapAbs !== undefined && mcapAbs > 0 ? (fcfAbs / mcapAbs) * 100 : undefined;
  return {
    cmp: raw(price.regularMarketPrice),
    marketCap: mcapAbs !== undefined ? mcapAbs / 1e7 : undefined,
    enterpriseValue: evAbs !== undefined ? evAbs / 1e7 : undefined,
    pe: raw(sd.trailingPE),
    pb: raw(ks.priceToBook),
    eps: raw(ks.trailingEps),
    dividendYield: div !== undefined ? div * 100 : undefined,
    sharesOutstanding: shares !== undefined ? shares / 1e7 : undefined,
    evEbitda: raw(ks.enterpriseToEbitda),
    roe: roeRaw !== undefined ? roeRaw * 100 : undefined,
    debtEquity: deRaw !== undefined ? (deRaw > 5 ? deRaw / 100 : deRaw) : undefined,
    netDebt: netDebtCr,
    fcfYield,
  };
}

function numOrUndef(v: unknown): number | undefined {
  const n = typeof v === "string" ? parseFloat(v) : (v as number);
  return typeof n === "number" && isFinite(n) ? n : undefined;
}

function mergeDefined(...parts: LiveQuote[]): LiveQuote {
  const out: LiveQuote = {};
  for (const p of parts) {
    for (const [k, v] of Object.entries(p)) {
      if (v !== undefined && (v as any) !== null) (out as any)[k] = v;
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Core fetch + retry logic
// ---------------------------------------------------------------------------

async function fetchLive(ticker: string): Promise<{ live: LiveQuote; stale: boolean }> {
  for (const suffix of CANDIDATE_SUFFIXES) {
    const sym = `${ticker}${suffix}`;
    try {
      const [chart, summary] = await Promise.allSettled([
        withRetry(() => fetchChart(sym), FETCH_MAX_RETRIES, FETCH_RETRY_BASE_DELAY_MS, `chart:${sym}`),
        withRetry(() => fetchQuoteSummary(sym), FETCH_MAX_RETRIES, FETCH_RETRY_BASE_DELAY_MS, `summary:${sym}`),
      ]);
      const merged = mergeDefined(
        chart.status === "fulfilled" ? chart.value : {},
        summary.status === "fulfilled" ? summary.value : {},
      );
      if (merged.cmp !== undefined) {
        return { live: merged, stale: false };
      }
    } catch (err) {
      logger.debug(`market-data: all retries exhausted for ${sym}, trying next suffix`, err);
    }
  }
  // All suffixes failed — return empty quote with stale indicator.
  logger.warn(`market-data: live data unavailable for ${ticker} — returning stale/empty quote`);
  return { live: {}, stale: true };
}

// ---------------------------------------------------------------------------
// Cache wrapper
// ---------------------------------------------------------------------------

// Cache entry shape (includes stale flag alongside the quote data)
type CacheEntry = { live: LiveQuote; stale: boolean };

async function getCached(ticker: string): Promise<CacheEntry> {
  const key = ticker.trim().toUpperCase();
  const hit = cache.get<CacheEntry>(key);
  if (hit) return hit;
  const entry = await fetchLive(key);
  // Only cache successful responses for the full TTL; stale responses use a
  // shorter TTL so we retry sooner rather than caching failure for 5 minutes.
  if (entry.stale) {
    cache.set(key, entry, 30); // retry in 30s
  } else {
    cache.set(key, entry);
  }
  return entry;
}

// ---------------------------------------------------------------------------
// Public API — maps a LiveQuote onto the Company shape used by components
// ---------------------------------------------------------------------------

function toCompanyPatch(q: LiveQuote): Partial<Company> {
  const patch: Partial<Company> = {};
  if (q.cmp !== undefined) patch.cmp = Math.max(1, Math.round(q.cmp));
  return patch;
}

/**
 * Fetches Yahoo Finance data and returns a LiveQuote, the Company patch
 * used by the client, and a `stale` flag indicating whether live data
 * was available. Never throws.
 */
export async function getLiveQuote(
  ticker: string,
): Promise<{ ticker: string; live: LiveQuote; patch: Partial<Company>; stale: boolean }> {
  const { live, stale } = await getCached(ticker);
  return { ticker: ticker.toUpperCase(), live, patch: toCompanyPatch(live), stale };
}

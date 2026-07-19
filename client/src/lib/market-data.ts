import { applyLiveOverride } from "@shared/data/universe";
import type { Company } from "@shared/data/companies";

/**
 * Centralized market-data client.
 *
 * All Yahoo Finance network I/O now happens on the Express server
 * (see server/src/services/market-data.service.ts and
 * server/src/controllers/market.controller.ts). This module only calls
 * that REST endpoint from the browser and applies the resulting patch
 * to the in-memory company override cache, exactly like the previous
 * TanStack Start server function did.
 */

// Re-export from the shared package — single source of truth for this type.
export type { LiveQuote } from "@shared/lib/market-data-types";
import type { LiveQuote } from "@shared/lib/market-data-types";

type MarketDataResponse = {
  ticker: string;
  live: LiveQuote;
  patch: Partial<Company>;
  /** True when Yahoo Finance was unreachable or returned no usable data. */
  stale: boolean;
};

/** Result shape returned to callers (Fix 17: exposes stale indicator). */
export type HydrateResult = {
  live: LiveQuote;
  /** True when live data could not be fetched — UI should show a warning. */
  stale: boolean;
};

/**
 * Fetch live market data for a ticker from the Express REST API,
 * register the CMP override, and return the LiveQuote + stale flag.
 * Never throws: on any network failure returns { live: {}, stale: true }.
 */
export async function hydrateLiveCompany(
  ticker: string,
): Promise<HydrateResult> {
  try {
    const res = await fetch(`/api/market-data/${encodeURIComponent(ticker)}`, {
      method: "GET",
      headers: { Accept: "application/json" },
    });
    if (!res.ok) return { live: {}, stale: true };
    const data = (await res.json()) as MarketDataResponse;
    if (data?.patch && Object.keys(data.patch).length > 0) {
      applyLiveOverride(data.ticker, data.patch);
    }
    return { live: data?.live ?? {}, stale: data?.stale ?? false };
  } catch {
    return { live: {}, stale: true };
  }
}

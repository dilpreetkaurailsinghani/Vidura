import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useMemo, useState, useEffect, useRef } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  ArrowLeft,
  Download,
  FileText,
  FileSpreadsheet,
  Presentation,
  Send,
  Loader2,
  TrendingUp,
  TrendingDown,
  Sparkles,
} from "lucide-react";
import { resolveCompany } from "@shared/data/universe";
import { hydrateLiveCompany } from "@/lib/market-data";
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
  sensitivity,
  scenarios,
  isBank,
  fmtCr,
  fmtPctRaw,
  fmtNum,
  fmtMx,
  fmtRs,
  type Forecast,
  type DCFInputs,
} from "@shared/lib/financials";
import { computeKPIs } from "@shared/lib/financialRatios";
import {
  exportExcelModel,
  exportPdfReport,
  exportPptxMemo,
} from "@/lib/exports";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { toast } from "sonner";

export const Route = createFileRoute("/company/$ticker")({
  loader: async ({ params }) => {
    const c = resolveCompany(params.ticker);
    if (!c) throw notFound();
    const { live, stale } = await hydrateLiveCompany(params.ticker);
    return { ticker: c.ticker, live, stale };
  },
  head: ({ params }) => {
    const c = resolveCompany(params.ticker);
    const name = c?.name ?? params.ticker;
    return {
      meta: [
        { title: `${name} (${params.ticker}) — Vidura Equity Research` },
        {
          name: "description",
          content: `Financial model, DCF valuation and AI research report for ${name}.`,
        },
        { property: "og:title", content: `${name} — Equity Research` },
      ],
    };
  },
  component: CompanyPage,
  notFoundComponent: () => (
    <div className="min-h-screen grid place-items-center p-6 text-center">
      <div>
        <h1 className="text-3xl font-semibold">Not in coverage</h1>
        <p className="text-muted-foreground mt-2">
          v1 covers 10 Nifty large caps.
        </p>
        <Link to="/" className="mt-6 inline-block underline">
          Back to search
        </Link>
      </div>
    </div>
  ),
});

type Tab =
  | "model"
  | "dashboard"
  | "financials"
  | "forecast"
  | "valuation"
  | "research"
  | "chat"
  | "learn";

function CompanyPage() {
  const { ticker } = Route.useParams();
  const { live, stale } = Route.useLoaderData();
  const c = resolveCompany(ticker)!;
  const [tab, setTab] = useState<Tab>("model");
  const [forecast, setForecast] = useState<Forecast>(() => defaultForecast(c));
  const [dcfInputs, setDcfInputs] = useState<DCFInputs>(() =>
    defaultDCFInputs(c),
  );

  const inc = useMemo(
    () => buildIncome(c.history, c.history[c.history.length - 1].shares),
    [c],
  );
  const bal = useMemo(() => buildBalance(c.history), [c]);
  const cf = useMemo(() => buildCashFlow(c.history, inc), [c, inc]);
  const ratios = useMemo(() => buildRatios(inc, bal, c.history), [c, inc, bal]);
  const fc = useMemo(() => projectForecast(c, forecast), [c, forecast]);
  const dcf = useMemo(() => runDCF(c, fc, dcfInputs), [c, fc, dcfInputs]);
  const rel = useMemo(() => relativeValuation(c), [c]);
  const sens = useMemo(() => sensitivity(c, fc, dcfInputs), [c, fc, dcfInputs]);
  const scns = useMemo(
    () => scenarios(c, forecast, dcfInputs),
    [c, forecast, dcfInputs],
  );
  const last = inc[inc.length - 1];
  const lastRatio = ratios[ratios.length - 1];
  const bank = isBank(c);

  return (
    <div className="min-h-screen">
      <header className="border-b border-border/60 sticky top-0 z-10 bg-background/90 backdrop-blur-sm">
        <div className="max-w-[1400px] mx-auto px-6 h-14 flex items-center justify-between">
          <Link
            to="/"
            className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="w-4 h-4" /> Search
          </Link>
          <div className="flex items-center gap-3">
            <ExportMenu c={c} dcf={dcf} forecast={fc} f={forecast} />
          </div>
        </div>
      </header>

      <div className="max-w-[1400px] mx-auto px-6 pt-8 pb-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="ticker-chip text-amber">NSE:{c.ticker}</span>
              {c.bse && (
                <span className="ticker-chip text-muted-foreground">
                  BSE:{c.bse}
                </span>
              )}
              <span className="text-xs text-muted-foreground">
                {c.sector} · {c.industry}
              </span>
            </div>
            <h1 className="text-3xl md:text-4xl font-semibold tracking-tight">
              {c.name}
            </h1>
          </div>
          <div className="flex items-end gap-6">
            <div className="flex flex-col items-start gap-1">
              <Quote label="CMP" value={fmtRs(live?.cmp ?? c.cmp)} />
              {stale && (
                <span className="text-[10px] text-muted-foreground border border-border/50 rounded px-1.5 py-0.5 leading-none">
                  seeded price · live data unavailable
                </span>
              )}
            </div>
            <Quote
              label="Intrinsic (DCF)"
              value={fmtRs(dcf.intrinsicPrice)}
              accent
            />
            <Quote
              label="Upside"
              value={`${(dcf.upside * 100).toFixed(1)}%`}
              tone={
                dcf.upside > 0.05
                  ? "bull"
                  : dcf.upside < -0.05
                    ? "bear"
                    : "flat"
              }
            />
          </div>
        </div>

        {bank && (
          <div
            className="mt-5 panel p-3 text-xs flex gap-3 items-start"
            style={{
              borderColor: "color-mix(in oklab, var(--amber) 40%, transparent)",
              background: "color-mix(in oklab, var(--amber) 8%, transparent)",
            }}
          >
            <Sparkles className="w-4 h-4 text-amber shrink-0 mt-0.5" />
            <p className="text-foreground/85 leading-relaxed">
              <span className="text-amber font-semibold">
                Bank methodology note:
              </span>{" "}
              Banks don't have COGS / EBITDA / capex in the conventional sense.
              The 3-statement and FCF/DCF lines here are simplified — production
              bank research uses Residual Income / Excess Return / P-to-ABV
              models. Focus on <em>NIM, CASA, GNPA, ROA, ROE, P/B</em>.
            </p>
          </div>
        )}

        <nav className="mt-6 flex gap-1 border-b border-border overflow-x-auto">
          {(
            [
              "model",
              "dashboard",
              "financials",
              "forecast",
              "valuation",
              "research",
              "chat",
              "learn",
            ] as Tab[]
          ).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-2.5 text-sm capitalize border-b-2 -mb-px transition whitespace-nowrap ${
                tab === t
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {t === "chat"
                ? "AI Analyst"
                : t === "model"
                  ? "Full Model"
                  : t === "learn"
                    ? "Layman Guide"
                    : t}
            </button>
          ))}
        </nav>
      </div>

      <main className="max-w-[1400px] mx-auto px-6 pb-24">
        {tab === "model" && (
          <FullModel
            c={c}
            inc={inc}
            bal={bal}
            cf={cf}
            ratios={ratios}
            forecast={forecast}
            setForecast={setForecast}
            fc={fc}
            dcfInputs={dcfInputs}
            setDcfInputs={setDcfInputs}
            dcf={dcf}
            rel={rel}
            sens={sens}
            scns={scns}
            bank={bank}
            last={last}
            lastRatio={lastRatio}
            live={live}
          />
        )}
        {tab === "dashboard" && (
          <Dashboard
            c={c}
            inc={inc}
            cf={cf}
            ratios={ratios}
            rel={rel}
            last={last}
            lastRatio={lastRatio}
            dcf={dcf}
            live={live}
          />
        )}
        {tab === "financials" && (
          <Financials inc={inc} bal={bal} cf={cf} ratios={ratios} />
        )}
        {tab === "forecast" && (
          <ForecastPanel
            forecast={forecast}
            setForecast={setForecast}
            fc={fc}
          />
        )}
        {tab === "valuation" && (
          <Valuation
            c={c}
            dcf={dcf}
            dcfInputs={dcfInputs}
            setDcfInputs={setDcfInputs}
            rel={rel}
          />
        )}
        {tab === "research" && <Research c={c} dcf={dcf} />}
        {tab === "chat" && (
          <AnalystChat ticker={c.ticker} companyName={c.name} />
        )}
        {tab === "learn" && (
          <LaymanGuide companyName={c.name} ticker={c.ticker} />
        )}
      </main>
    </div>
  );
}

function FullModel({
  c,
  inc,
  bal,
  cf,
  ratios,
  forecast,
  setForecast,
  fc,
  dcfInputs,
  setDcfInputs,
  dcf,
  rel,
  sens,
  scns,
  bank,
  last,
  lastRatio,
  live,
}: any) {
  return (
    <div className="space-y-10">
      <Section
        n="01"
        title="Executive Snapshot"
        sub="KPIs, charts and overview"
      >
        <Dashboard
          c={c}
          inc={inc}
          cf={cf}
          ratios={ratios}
          rel={rel}
          last={last}
          lastRatio={lastRatio}
          dcf={dcf}
          live={live}
        />
      </Section>

      <Section
        n="02"
        title="Historical Financials"
        sub="5-year three-statement model + ratios"
      >
        <Financials inc={inc} bal={bal} cf={cf} ratios={ratios} />
      </Section>

      <Section
        n="03"
        title="Forecast & Assumptions"
        sub="Editable drivers — model updates live"
      >
        <ForecastPanel forecast={forecast} setForecast={setForecast} fc={fc} />
      </Section>

      <Section
        n="04"
        title="Valuation — DCF & Relative"
        sub={
          bank
            ? "Simplified for illustration (see bank note above)"
            : "WACC build, intrinsic value, multiples"
        }
      >
        <Valuation
          c={c}
          dcf={dcf}
          dcfInputs={dcfInputs}
          setDcfInputs={setDcfInputs}
          rel={rel}
        />
      </Section>

      <Section
        n="05"
        title="Sensitivity Analysis"
        sub="Intrinsic price (₹) — WACC × Terminal growth"
      >
        <Card>
          <div className="overflow-x-auto -mx-2">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-muted-foreground text-xs">
                  <th className="text-left pb-2 px-2 uppercase tracking-wider font-medium">
                    TG ↓ / WACC →
                  </th>
                  {sens.waccs.map((w: number) => (
                    <th
                      key={w}
                      className="text-right pb-2 px-3 num font-medium"
                    >
                      {w.toFixed(2)}%
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sens.tgs.map((tg: number, i: number) => (
                  <tr key={tg} className="border-t border-border/60">
                    <td className="py-1.5 px-2 num text-muted-foreground">
                      {tg.toFixed(2)}%
                    </td>
                    {sens.matrix[i].map((p: number, j: number) => {
                      const hot = p > c.cmp * 1.15;
                      const cold = p < c.cmp * 0.85;
                      return (
                        <td
                          key={j}
                          className={`py-1.5 px-3 text-right num ${hot ? "text-bull" : cold ? "text-bear" : ""}`}
                        >
                          {fmtRs(p)}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-muted-foreground mt-3">
            Green = ≥15% upside vs CMP ₹{c.cmp.toLocaleString("en-IN")} · Red =
            ≥15% downside.
          </p>
        </Card>
      </Section>

      <Section n="06" title="Scenario Analysis" sub="Bear / Base / Bull cases">
        <div className="grid md:grid-cols-3 gap-4">
          {scns.map((s: any) => {
            const tone =
              s.name === "Bull"
                ? "text-bull"
                : s.name === "Bear"
                  ? "text-bear"
                  : "text-amber";
            return (
              <div key={s.name} className="panel p-5">
                <div
                  className={`text-xs font-mono tracking-wider uppercase ${tone}`}
                >
                  {s.name} CASE
                </div>
                <div className="num text-3xl font-semibold mt-3 text-foreground">
                  {fmtRs(s.price)}
                </div>
                <div className={`text-sm mt-1 ${tone}`}>
                  {(s.upside * 100).toFixed(1)}% vs CMP
                </div>
                <div className="mt-4 text-xs text-foreground/80 space-y-1 border-t border-border pt-3">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">
                      Revenue growth
                    </span>
                    <span className="num">{s.growth.toFixed(1)}%</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">EBITDA margin</span>
                    <span className="num">{s.margin.toFixed(1)}%</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </Section>

      <Section n="07" title="AI Equity Research Note">
        <Research c={c} dcf={dcf} />
      </Section>

      <Section
        n="08"
        title="Export the Model"
        sub="Download the entire workspace"
      >
        <div className="grid md:grid-cols-3 gap-3">
          <ExportTile
            icon={<FileSpreadsheet />}
            title="Excel model"
            sub="3-statement + DCF + forecast"
            onClick={() => exportExcelModel(c, fc, dcf, forecast)}
          />
          <ExportTile
            icon={<FileText />}
            title="PDF research report"
            sub="Full institutional note"
            onClick={async () => {
              const res = await fetch("/api/report", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ ticker: c.ticker }),
              });
              const { markdown } = await res.json();
              exportPdfReport(c, markdown, dcf);
            }}
          />
          <ExportTile
            icon={<Presentation />}
            title="PowerPoint memo"
            sub="Investment committee slides"
            onClick={() =>
              exportPptxMemo(c, dcf, [
                `${c.name} — ${c.sector}. CMP ₹${c.cmp}, intrinsic ₹${dcf.intrinsicPrice.toFixed(0)} (${(dcf.upside * 100).toFixed(1)}%).`,
                `WACC ${(dcf.wacc * 100).toFixed(2)}%, ${forecast.years}Y forecast at ${forecast.revenueGrowth.toFixed(1)}% revenue growth and ${forecast.ebitdaMargin.toFixed(1)}% EBITDA margin.`,
              ])
            }
          />
        </div>
      </Section>
    </div>
  );
}

function Section({
  n,
  title,
  sub,
  children,
}: {
  n: string;
  title: string;
  sub?: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <div className="flex items-baseline gap-3 mb-4 pb-3 border-b border-border">
        <span className="text-xs font-mono text-amber tracking-wider">
          § {n}
        </span>
        <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
        {sub && (
          <span className="text-xs text-muted-foreground ml-auto hidden sm:block">
            {sub}
          </span>
        )}
      </div>
      {children}
    </section>
  );
}

function ExportTile({
  icon,
  title,
  sub,
  onClick,
}: {
  icon: React.ReactNode;
  title: string;
  sub: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="text-left p-5 rounded-md border border-border bg-secondary/40 hover:border-primary/60 hover:bg-card transition group"
    >
      <div className="w-10 h-10 rounded bg-amber-soft text-amber grid place-items-center mb-3 group-hover:scale-105 transition">
        {icon}
      </div>
      <div className="font-semibold">{title}</div>
      <div className="text-xs text-muted-foreground mt-1">{sub}</div>
    </button>
  );
}

/* ---------------- Components ---------------- */

function Quote({
  label,
  value,
  tone,
  accent,
}: {
  label: string;
  value: string;
  tone?: "bull" | "bear" | "flat";
  accent?: boolean;
}) {
  const color =
    tone === "bull"
      ? "text-bull"
      : tone === "bear"
        ? "text-bear"
        : accent
          ? "text-amber"
          : "text-foreground";
  return (
    <div className="text-right">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div className={`num text-2xl font-semibold ${color}`}>{value}</div>
    </div>
  );
}

function Card({
  title,
  sub,
  children,
  className = "",
}: {
  title?: string;
  sub?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`panel p-5 ${className}`}>
      {title && (
        <div className="flex items-baseline justify-between mb-4">
          <h3 className="text-sm font-semibold tracking-wide uppercase text-muted-foreground">
            {title}
          </h3>
          {sub && <span className="text-xs text-muted-foreground">{sub}</span>}
        </div>
      )}
      {children}
    </div>
  );
}

const chartTooltip = {
  contentStyle: {
    background: "oklch(0.18 0.013 240)",
    border: "1px solid oklch(0.27 0.013 240)",
    borderRadius: 6,
    fontSize: 12,
  },
  labelStyle: { color: "oklch(0.96 0.005 90)" },
};

function Dashboard({
  c,
  inc,
  cf,
  ratios,
  rel,
  last,
  lastRatio,
  dcf,
  live,
}: any) {
  const trend = inc.map((r: any, i: number) => ({
    year: r.year,
    revenue: r.revenue,
    ebitda: r.ebitda,
    pat: r.pat,
    margin: (r.ebitda / r.revenue) * 100,
    fcf: cf[i].fcf,
  }));

  const k = computeKPIs(c, {
    cmp: live?.cmp,
    marketCap: live?.marketCap,
    sharesOutstanding: live?.sharesOutstanding,
    beta: live?.beta,
  });
  const kv = <T,>(v: T | undefined | null, fmt: (x: T) => string) =>
    v === undefined || v === null || (typeof v === "number" && !isFinite(v))
      ? "N/A"
      : fmt(v as T);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <Kpi label="Market Cap" value={kv(k.marketCap, (v) => fmtCr(v))} />
        <Kpi
          label="Enterprise Value"
          value={kv(k.enterpriseValue, (v) => fmtCr(v))}
        />
        <Kpi label="PE" value={kv(k.pe, (v) => fmtMx(v))} />
        <Kpi label="EV / EBITDA" value={kv(k.evEbitda, (v) => fmtMx(v))} />
        <Kpi label="ROE" value={kv(k.roe, (v) => fmtPctRaw(v))} />
        <Kpi label="ROCE" value={kv(k.roce, (v) => fmtPctRaw(v))} />
        <Kpi label="D/E" value={kv(k.debtEquity, (v) => v.toFixed(2))} />
        <Kpi label="PB" value={kv(k.pb, (v) => fmtMx(v))} />
        <Kpi
          label="FCF Yield"
          value={kv(k.fcfYield, (v) => `${v.toFixed(1)}%`)}
        />
        <Kpi label="EPS (TTM)" value={kv(k.eps, (v) => fmtRs(v))} />
        <Kpi label="Net Debt" value={kv(k.netDebt, (v) => fmtCr(v))} />
        <Kpi
          label="Interest Coverage"
          value={kv(k.interestCoverage, (v) => `${v.toFixed(1)}x`)}
        />
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <Card title="Revenue & EBITDA" sub="₹ Crores">
          <ResponsiveContainer width="100%" height={260}>
            <AreaChart data={trend} margin={{ left: 0, right: 8, top: 8 }}>
              <defs>
                <linearGradient id="g1" x1="0" y1="0" x2="0" y2="1">
                  <stop
                    offset="0%"
                    stopColor="var(--chart-1)"
                    stopOpacity={0.5}
                  />
                  <stop
                    offset="100%"
                    stopColor="var(--chart-1)"
                    stopOpacity={0}
                  />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="var(--grid)" strokeDasharray="2 4" />
              <XAxis
                dataKey="year"
                stroke="var(--muted-foreground)"
                fontSize={11}
              />
              <YAxis stroke="var(--muted-foreground)" fontSize={11} />
              <Tooltip {...chartTooltip} formatter={(v: number) => fmtNum(v)} />
              <Area
                type="monotone"
                dataKey="revenue"
                stroke="var(--chart-1)"
                fill="url(#g1)"
                strokeWidth={2}
              />
              <Line
                type="monotone"
                dataKey="ebitda"
                stroke="var(--chart-3)"
                strokeWidth={2}
                dot={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </Card>

        <Card title="PAT & Free Cash Flow" sub="₹ Crores">
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={trend} margin={{ left: 0, right: 8, top: 8 }}>
              <CartesianGrid stroke="var(--grid)" strokeDasharray="2 4" />
              <XAxis
                dataKey="year"
                stroke="var(--muted-foreground)"
                fontSize={11}
              />
              <YAxis stroke="var(--muted-foreground)" fontSize={11} />
              <Tooltip {...chartTooltip} formatter={(v: number) => fmtNum(v)} />
              <Bar dataKey="pat" fill="var(--chart-1)" radius={[3, 3, 0, 0]} />
              <Bar dataKey="fcf" fill="var(--chart-2)" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>

        <Card title="EBITDA Margin" sub="%">
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={trend}>
              <CartesianGrid stroke="var(--grid)" strokeDasharray="2 4" />
              <XAxis
                dataKey="year"
                stroke="var(--muted-foreground)"
                fontSize={11}
              />
              <YAxis
                stroke="var(--muted-foreground)"
                fontSize={11}
                domain={["dataMin - 2", "dataMax + 2"]}
              />
              <Tooltip
                {...chartTooltip}
                formatter={(v: number) => `${v.toFixed(1)}%`}
              />
              <Line
                type="monotone"
                dataKey="margin"
                stroke="var(--amber)"
                strokeWidth={2.5}
                dot={{ r: 3 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </Card>

        <Card title="Business Overview">
          <p className="text-sm leading-relaxed text-foreground/85">
            {c.description}
          </p>
          <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
            <Info label="Sector" value={c.sector} />
            <Info label="Industry" value={c.industry} />
            <Info label="Beta" value={c.beta.toFixed(2)} />
            <Info label="Tax Rate" value={`${(c.taxRate * 100).toFixed(1)}%`} />
            <Info
              label="Shares Outstanding"
              value={`${c.history[c.history.length - 1].shares.toFixed(0)} Cr`}
            />
            <Info label="Peers" value={c.peers.join(", ")} />
          </div>
        </Card>
      </div>
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="panel p-3">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div className="num text-base font-semibold mt-1">{value}</div>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div className="text-foreground">{value}</div>
    </div>
  );
}

function Financials({ inc, bal, cf, ratios }: any) {
  return (
    <div className="space-y-4">
      <Card title="Income Statement" sub="₹ Crores">
        <StatementTable
          years={inc.map((r: any) => r.year)}
          rows={[
            ["Revenue", inc.map((r: any) => r.revenue)],
            ["COGS", inc.map((r: any) => r.cogs)],
            ["Gross Profit", inc.map((r: any) => r.grossProfit), "subtotal"],
            ["Operating Expenses", inc.map((r: any) => r.opex)],
            ["EBITDA", inc.map((r: any) => r.ebitda), "subtotal"],
            ["D&A", inc.map((r: any) => r.da)],
            ["EBIT", inc.map((r: any) => r.ebit), "subtotal"],
            ["Interest", inc.map((r: any) => r.interest)],
            ["Other Income", inc.map((r: any) => r.otherIncome)],
            ["PBT", inc.map((r: any) => r.pbt), "subtotal"],
            ["Tax", inc.map((r: any) => r.tax)],
            ["PAT", inc.map((r: any) => r.pat), "total"],
            ["EPS (₹)", inc.map((r: any) => r.eps), "italic"],
          ]}
        />
      </Card>
      <Card title="Balance Sheet" sub="₹ Crores">
        <StatementTable
          years={bal.map((r: any) => r.year)}
          rows={[
            ["Cash & Equivalents", bal.map((r: any) => r.cash)],
            ["Receivables", bal.map((r: any) => r.receivables)],
            ["Inventory", bal.map((r: any) => r.inventory)],
            ["Other Current Assets", bal.map((r: any) => r.otherCA)],
            [
              "Total Current Assets",
              bal.map((r: any) => r.currentAssets),
              "subtotal",
            ],
            ["PP&E", bal.map((r: any) => r.ppe)],
            ["Other Non-Current Assets", bal.map((r: any) => r.otherNCA)],
            ["Total Assets", bal.map((r: any) => r.totalAssets), "total"],
            ["Payables", bal.map((r: any) => r.payables)],
            ["Short-term Debt", bal.map((r: any) => r.shortDebt)],
            ["Other Current Liab.", bal.map((r: any) => r.otherCL)],
            ["Long-term Debt", bal.map((r: any) => r.longDebt)],
            ["Other Non-Current Liab.", bal.map((r: any) => r.otherNCL)],
            ["Equity", bal.map((r: any) => r.equity)],
            [
              "Total Liab + Equity",
              bal.map((r: any) => r.totalLiabEquity),
              "total",
            ],
          ]}
        />
      </Card>
      <Card title="Cash Flow Statement" sub="₹ Crores">
        <StatementTable
          years={cf.map((r: any) => r.year)}
          rows={[
            ["PAT", cf.map((r: any) => r.pat)],
            ["+ D&A", cf.map((r: any) => r.da)],
            ["− Δ Working Capital", cf.map((r: any) => -r.wcChange)],
            ["CFO", cf.map((r: any) => r.cfo), "subtotal"],
            ["Capex", cf.map((r: any) => -r.capex)],
            ["CFI", cf.map((r: any) => r.cfi), "subtotal"],
            ["Debt Change", cf.map((r: any) => r.debtChange)],
            ["Dividends", cf.map((r: any) => -r.dividends)],
            ["CFF", cf.map((r: any) => r.cff), "subtotal"],
            ["Net Change in Cash", cf.map((r: any) => r.netCash), "total"],
            ["Free Cash Flow", cf.map((r: any) => r.fcf), "italic"],
          ]}
        />
      </Card>
      <Card title="Key Ratios">
        <StatementTable
          years={ratios.map((r: any) => r.year)}
          fmt={(v: number) => `${(v * 100).toFixed(1)}%`}
          rows={[
            ["Gross Margin", ratios.map((r: any) => r.grossMargin)],
            ["EBITDA Margin", ratios.map((r: any) => r.ebitdaMargin)],
            ["EBIT Margin", ratios.map((r: any) => r.ebitMargin)],
            ["Net Margin", ratios.map((r: any) => r.netMargin)],
            ["ROE", ratios.map((r: any) => r.roe)],
            ["ROCE", ratios.map((r: any) => r.roce)],
          ]}
        />
        <div className="h-2" />
        <StatementTable
          years={ratios.map((r: any) => r.year)}
          fmt={(v: number) => v.toFixed(2)}
          rows={[
            ["Debt / Equity", ratios.map((r: any) => r.debtEquity)],
            ["Current Ratio", ratios.map((r: any) => r.currentRatio)],
            ["Asset Turnover", ratios.map((r: any) => r.assetTurnover)],
          ]}
        />
      </Card>
    </div>
  );
}

function StatementTable({
  years,
  rows,
  fmt = fmtNum,
}: {
  years: string[];
  rows: [string, number[], ("subtotal" | "total" | "italic")?][];
  fmt?: (v: number) => string;
}) {
  return (
    <div className="overflow-x-auto -mx-2">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-muted-foreground text-xs">
            <th className="text-left font-medium pb-2 px-2 uppercase tracking-wider">
              Line item
            </th>
            {years.map((y) => (
              <th key={y} className="text-right font-medium pb-2 px-3 num">
                {y}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map(([label, vals, kind]) => (
            <tr
              key={label}
              className={`border-t border-border/60 ${
                kind === "total"
                  ? "font-semibold bg-secondary/40"
                  : kind === "subtotal"
                    ? "font-medium bg-secondary/20"
                    : kind === "italic"
                      ? "italic text-muted-foreground"
                      : ""
              }`}
            >
              <td className="py-1.5 px-2">{label}</td>
              {vals.map((v, i) => (
                <td key={i} className="py-1.5 px-3 text-right num">
                  {fmt(v)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ForecastPanel({
  forecast,
  setForecast,
  fc,
}: {
  forecast: Forecast;
  setForecast: (f: Forecast) => void;
  fc: any[];
}) {
  const update = (k: keyof Forecast, v: number) =>
    setForecast({ ...forecast, [k]: v });
  const knob = (
    label: string,
    key: keyof Forecast,
    min: number,
    max: number,
    step = 0.5,
    suffix = "%",
  ) => (
    <div className="panel p-4">
      <div className="flex items-baseline justify-between mb-2">
        <span className="text-xs uppercase tracking-wider text-muted-foreground">
          {label}
        </span>
        <span className="num text-lg font-semibold text-amber">
          {(forecast[key] as number).toFixed(1)}
          {suffix}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={forecast[key] as number}
        onChange={(e) => update(key, parseFloat(e.target.value))}
        className="w-full accent-primary"
      />
    </div>
  );

  return (
    <div className="space-y-4">
      <Card
        title="Forecast assumptions"
        sub="Drag knobs to re-model — DCF updates live"
      >
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {knob("Revenue growth", "revenueGrowth", 0, 30)}
          {knob("EBITDA margin", "ebitdaMargin", 5, 50)}
          {knob("D&A / sales", "daPctRevenue", 0, 20)}
          {knob("Capex / sales", "capexPctRevenue", 0, 30)}
          {knob("WC / sales", "wcPctRevenue", 0, 30)}
          {knob("Tax rate", "taxRate", 0, 40)}
          {knob("Interest rate", "interestRate", 0, 15)}
          <div className="panel p-4">
            <div className="text-xs uppercase tracking-wider text-muted-foreground mb-2">
              Forecast horizon
            </div>
            <div className="flex gap-2">
              {[5, 7, 10].map((y) => (
                <button
                  key={y}
                  onClick={() => update("years", y)}
                  className={`flex-1 py-2 rounded text-sm font-mono ${
                    forecast.years === y
                      ? "bg-primary text-primary-foreground"
                      : "bg-secondary text-muted-foreground"
                  }`}
                >
                  {y}Y
                </button>
              ))}
            </div>
          </div>
        </div>
      </Card>

      <Card
        title={`${forecast.years}-Year Forecast`}
        sub="₹ Crores · model output"
      >
        <StatementTable
          years={fc.map((r: any) => r.year)}
          rows={[
            ["Revenue", fc.map((r: any) => r.revenue)],
            ["EBITDA", fc.map((r: any) => r.ebitda), "subtotal"],
            ["D&A", fc.map((r: any) => r.da)],
            ["EBIT", fc.map((r: any) => r.ebit), "subtotal"],
            ["Interest", fc.map((r: any) => r.interest)],
            ["PBT", fc.map((r: any) => r.pbt), "subtotal"],
            ["Tax", fc.map((r: any) => r.tax)],
            ["PAT", fc.map((r: any) => r.pat), "total"],
            ["Capex", fc.map((r: any) => r.capex)],
            ["Δ Working Capital", fc.map((r: any) => r.wcChange)],
            ["Unlevered FCF", fc.map((r: any) => r.fcf), "total"],
          ]}
        />
      </Card>

      <Card title="FCF projection">
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={fc}>
            <CartesianGrid stroke="var(--grid)" strokeDasharray="2 4" />
            <XAxis
              dataKey="year"
              stroke="var(--muted-foreground)"
              fontSize={11}
            />
            <YAxis stroke="var(--muted-foreground)" fontSize={11} />
            <Tooltip {...chartTooltip} formatter={(v: number) => fmtNum(v)} />
            <Bar dataKey="fcf" radius={[4, 4, 0, 0]}>
              {fc.map((r: any, i: number) => (
                <Cell
                  key={i}
                  fill={r.fcf >= 0 ? "var(--chart-3)" : "var(--bear)"}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </Card>
    </div>
  );
}

function Valuation({ c, dcf, dcfInputs, setDcfInputs, rel }: any) {
  const update = (k: keyof DCFInputs, v: number) =>
    setDcfInputs({ ...dcfInputs, [k]: v });
  const knob = (
    label: string,
    key: keyof DCFInputs,
    min: number,
    max: number,
    step = 0.1,
    suffix = "%",
  ) => (
    <div className="panel p-4">
      <div className="flex items-baseline justify-between mb-2">
        <span className="text-xs uppercase tracking-wider text-muted-foreground">
          {label}
        </span>
        <span className="num text-base font-semibold text-amber">
          {(dcfInputs[key] as number).toFixed(2)}
          {suffix}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={dcfInputs[key] as number}
        onChange={(e) => update(key, parseFloat(e.target.value))}
        className="w-full accent-primary"
      />
    </div>
  );

  const upside = dcf.upside;
  const verdict =
    upside > 0.15
      ? "UNDERVALUED"
      : upside < -0.1
        ? "OVERVALUED"
        : "FAIRLY VALUED";
  const verdictTone =
    upside > 0.15
      ? "text-bull bg-bull-soft"
      : upside < -0.1
        ? "text-bear bg-bear-soft"
        : "text-amber bg-amber-soft";

  return (
    <div className="space-y-4">
      <div className="grid lg:grid-cols-3 gap-4">
        <Card title="WACC build">
          <div className="space-y-3 text-sm">
            <Row k="Beta" v={dcfInputs.beta.toFixed(2)} />
            <Row
              k="Risk-free rate"
              v={`${dcfInputs.riskFreeRate.toFixed(2)}%`}
            />
            <Row
              k="Market risk premium"
              v={`${dcfInputs.marketRiskPremium.toFixed(2)}%`}
            />
            <Row
              k="Cost of Equity"
              v={`${(dcf.costOfEquity * 100).toFixed(2)}%`}
              bold
            />
            <div className="h-px bg-border" />
            <Row
              k="Pre-tax cost of debt"
              v={`${dcfInputs.costOfDebt.toFixed(2)}%`}
            />
            <Row k="Tax rate" v={`${dcfInputs.taxRate.toFixed(1)}%`} />
            <Row k="Debt weight" v={`${dcfInputs.debtWeight.toFixed(1)}%`} />
            <div className="h-px bg-border" />
            <Row k="WACC" v={`${(dcf.wacc * 100).toFixed(2)}%`} accent />
          </div>
        </Card>

        <Card title="DCF assumptions" className="lg:col-span-2">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {knob("Beta", "beta", 0.3, 2, 0.05, "")}
            {knob("Risk-free rate", "riskFreeRate", 4, 10, 0.1)}
            {knob("MRP", "marketRiskPremium", 4, 10, 0.1)}
            {knob("Cost of debt", "costOfDebt", 4, 14, 0.1)}
            {knob("Tax rate", "taxRate", 0, 40, 0.5)}
            {knob("Terminal growth", "terminalGrowth", 1, 7, 0.1)}
          </div>
        </Card>
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        <Card title="Intrinsic value" className="lg:col-span-1">
          <div className="text-center py-4">
            <div className="text-xs uppercase tracking-wider text-muted-foreground">
              DCF Intrinsic Price
            </div>
            <div className="num text-5xl font-semibold text-amber mt-2">
              {fmtRs(dcf.intrinsicPrice)}
            </div>
            <div className="text-sm text-muted-foreground mt-1">
              vs CMP {fmtRs(c.cmp)}
            </div>
            <div
              className={`inline-flex items-center gap-1.5 mt-4 px-3 py-1 rounded ${verdictTone} text-xs font-semibold tracking-wider`}
            >
              {upside >= 0 ? (
                <TrendingUp className="w-3.5 h-3.5" />
              ) : (
                <TrendingDown className="w-3.5 h-3.5" />
              )}
              {verdict} · {(upside * 100).toFixed(1)}%
            </div>
          </div>
          <div className="border-t border-border pt-4 space-y-2 text-sm">
            <Row k="PV of FCF" v={fmtCr(dcf.pvFcf)} />
            <Row k="Terminal value" v={fmtCr(dcf.terminalValue)} />
            <Row k="PV of terminal" v={fmtCr(dcf.pvTerminal)} />
            <Row k="Enterprise value" v={fmtCr(dcf.enterpriseValue)} bold />
            <Row k="− Net debt" v={fmtCr(dcf.netDebt)} />
            <Row k="Equity value" v={fmtCr(dcf.equityValue)} accent />
          </div>
        </Card>

        <Card title="Relative valuation" className="lg:col-span-2">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
            <Multiple label="PE" v={`${rel.pe.toFixed(1)}x`} />
            <Multiple label="PB" v={`${rel.pb.toFixed(1)}x`} />
            <Multiple label="EV/EBITDA" v={`${rel.evEbitda.toFixed(1)}x`} />
            <Multiple label="EV/Revenue" v={`${rel.evRevenue.toFixed(1)}x`} />
          </div>
          <h4 className="text-xs uppercase tracking-wider text-muted-foreground mb-2">
            FCF discounting
          </h4>
          <StatementTable
            years={dcf.yearlyPV.map((r: any) => r.year)}
            rows={[
              ["FCF (₹ Cr)", dcf.yearlyPV.map((r: any) => r.fcf)],
              ["PV (₹ Cr)", dcf.yearlyPV.map((r: any) => r.pv), "subtotal"],
            ]}
          />
        </Card>
      </div>
    </div>
  );
}

function Multiple({ label, v }: { label: string; v: string }) {
  return (
    <div className="panel p-3 text-center">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div className="num text-xl font-semibold mt-1">{v}</div>
    </div>
  );
}

function Row({
  k,
  v,
  bold,
  accent,
}: {
  k: string;
  v: string;
  bold?: boolean;
  accent?: boolean;
}) {
  return (
    <div className="flex justify-between items-baseline">
      <span className="text-muted-foreground">{k}</span>
      <span
        className={`num ${bold ? "font-semibold" : ""} ${accent ? "text-amber font-semibold" : ""}`}
      >
        {v}
      </span>
    </div>
  );
}

function Research({ c, dcf }: any) {
  const [md, setMd] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const generate = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticker: c.ticker }),
      });
      if (!res.ok) {
        if (res.status === 429)
          throw new Error("Rate limit reached. Please retry in a minute.");
        if (res.status === 402)
          throw new Error(
            "AI credits exhausted. Add credits in workspace billing.",
          );
        throw new Error(`Report failed: ${res.status}`);
      }
      const data = await res.json();
      setMd(data.markdown);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card
      title="AI Equity Research Report"
      sub="Grounded in this workspace's financial data"
    >
      {!md && !loading && (
        <div className="text-center py-16">
          <div className="w-14 h-14 mx-auto rounded-full bg-amber-soft text-amber grid place-items-center mb-4">
            <Sparkles className="w-7 h-7" />
          </div>
          <h3 className="text-xl font-semibold">Generate full research note</h3>
          <p className="text-muted-foreground mt-2 max-w-md mx-auto text-sm">
            Institutional-format report — business overview, SWOT, valuation,
            thesis, target price and recommendation.
          </p>
          <button
            onClick={generate}
            className="mt-6 px-5 py-2.5 rounded bg-primary text-primary-foreground font-medium hover:opacity-90 transition"
          >
            Generate Report
          </button>
          {error && <p className="text-bear text-sm mt-4">{error}</p>}
        </div>
      )}
      {loading && (
        <div className="text-center py-16">
          <Loader2 className="w-8 h-8 mx-auto animate-spin text-amber" />
          <p className="text-sm text-muted-foreground mt-3">
            Writing research note for {c.name}…
          </p>
        </div>
      )}
      {md && (
        <>
          <div className="flex justify-end gap-2 mb-3">
            <button
              onClick={() => exportPdfReport(c, md, dcf)}
              className="text-xs px-3 py-1.5 rounded bg-secondary border border-border hover:bg-accent transition flex items-center gap-1.5"
            >
              <FileText className="w-3.5 h-3.5" /> Download PDF
            </button>
            <button
              onClick={generate}
              className="text-xs px-3 py-1.5 rounded bg-secondary border border-border hover:bg-accent transition"
            >
              Regenerate
            </button>
          </div>
          <Markdown text={md} />
        </>
      )}
    </Card>
  );
}

function Markdown({ text }: { text: string }) {
  const lines = text.split("\n");
  return (
    <article className="prose prose-invert max-w-none text-sm leading-relaxed">
      {lines.map((line, i) => {
        const t = line.trim();
        if (!t) return <div key={i} className="h-2" />;
        if (t.startsWith("## "))
          return (
            <h2 key={i} className="text-xl font-semibold mt-6 mb-2 text-amber">
              {t.slice(3)}
            </h2>
          );
        if (t.startsWith("### "))
          return (
            <h3 key={i} className="text-base font-semibold mt-4 mb-1">
              {t.slice(4)}
            </h3>
          );
        if (t.startsWith("- ") || t.startsWith("* "))
          return (
            <div key={i} className="flex gap-2 ml-2">
              <span className="text-amber">•</span>
              <span>{renderInline(t.slice(2))}</span>
            </div>
          );
        return (
          <p key={i} className="text-foreground/90">
            {renderInline(t)}
          </p>
        );
      })}
    </article>
  );
}

function renderInline(s: string): React.ReactNode {
  // bold **x**
  const parts = s.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((p, i) =>
    p.startsWith("**") && p.endsWith("**") ? (
      <strong key={i} className="font-semibold text-foreground">
        {p.slice(2, -2)}
      </strong>
    ) : (
      <span key={i}>{p}</span>
    ),
  );
}

function AnalystChat({
  ticker,
  companyName,
}: {
  ticker: string;
  companyName: string;
}) {
  const { messages, sendMessage, status } = useChat({
    transport: new DefaultChatTransport({
      api: "/api/chat",
      body: { ticker },
    }),
  });
  const [input, setInput] = useState("");
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;
    sendMessage({ text: input });
    setInput("");
    setTimeout(() => inputRef.current?.focus(), 0);
  };

  const suggestions = [
    `Is ${companyName} undervalued today?`,
    `What are the biggest risks?`,
    `Why have margins moved over the last 5 years?`,
    `Compare to peers.`,
  ];

  return (
    <Card title="AI Analyst" sub="Grounded in this workspace's data">
      <div className="h-[520px] flex flex-col">
        <div className="flex-1 overflow-y-auto space-y-4 pr-2">
          {messages.length === 0 && (
            <div className="text-center py-10">
              <div className="w-12 h-12 mx-auto rounded-full bg-amber-soft text-amber grid place-items-center mb-3">
                <Sparkles className="w-6 h-6" />
              </div>
              <p className="text-muted-foreground text-sm">
                Ask anything about {companyName}'s financials, valuation, or
                thesis.
              </p>
              <div className="flex flex-wrap justify-center gap-2 mt-4 max-w-xl mx-auto">
                {suggestions.map((s) => (
                  <button
                    key={s}
                    onClick={() => sendMessage({ text: s })}
                    className="text-xs px-3 py-1.5 rounded-full bg-secondary border border-border hover:border-primary/60 hover:text-amber transition"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}
          {messages.map((m) => (
            <div
              key={m.id}
              className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[85%] ${
                  m.role === "user"
                    ? "bg-primary text-primary-foreground px-4 py-2.5 rounded-lg"
                    : "text-foreground"
                }`}
              >
                {m.parts.map((p, i) =>
                  p.type === "text" ? (
                    <div
                      key={i}
                      className={
                        m.role === "user"
                          ? "text-sm"
                          : "text-sm leading-relaxed"
                      }
                    >
                      {m.role === "user" ? p.text : <Markdown text={p.text} />}
                    </div>
                  ) : null,
                )}
              </div>
            </div>
          ))}
          {status === "submitted" && (
            <div className="flex items-center gap-2 text-muted-foreground text-sm">
              <Loader2 className="w-3.5 h-3.5 animate-spin" /> Thinking…
            </div>
          )}
          <div ref={endRef} />
        </div>

        <form
          onSubmit={handleSubmit}
          className="mt-4 flex gap-2 border-t border-border pt-4"
        >
          <input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={`Ask about ${companyName}…`}
            className="flex-1 h-11 px-4 rounded bg-secondary border border-border focus:border-primary focus:ring-2 focus:ring-primary/30 outline-none text-sm"
          />
          <button
            type="submit"
            disabled={!input.trim() || status === "streaming"}
            className="h-11 w-11 grid place-items-center rounded bg-primary text-primary-foreground disabled:opacity-40 hover:opacity-90 transition"
          >
            <Send className="w-4 h-4" />
          </button>
        </form>
      </div>
    </Card>
  );
}

function ExportMenu({ c, dcf, forecast, f }: any) {
  const [open, setOpen] = useState(false);
  const [pdfLoading, setPdfLoading] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  const memo = [
    `${c.name} is positioned in ${c.sector} with a current market cap of ₹${((c.cmp * c.history[c.history.length - 1].shares) / 1e5).toFixed(2)} L Cr.`,
    `DCF intrinsic value of ₹${dcf.intrinsicPrice.toFixed(0)} implies ${(dcf.upside * 100).toFixed(1)}% ${dcf.upside >= 0 ? "upside" : "downside"} vs CMP of ₹${c.cmp}.`,
    `WACC of ${(dcf.wacc * 100).toFixed(2)}% reflects a beta of ${c.beta} and capital structure mix.`,
    `Forecast assumes ${f.revenueGrowth.toFixed(1)}% revenue growth and ${f.ebitdaMargin.toFixed(1)}% EBITDA margin over ${f.years} years.`,
  ];

  const ready = forecast.length > 0 && isFinite(dcf.intrinsicPrice);

  async function handlePdfExport() {
    setPdfLoading(true);
    try {
      const res = await fetch("/api/report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticker: c.ticker }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        const msg = (body as any)?.error ?? `Server error ${res.status}`;
        toast.error(`PDF export failed: ${msg}`);
        return;
      }
      const { markdown } = await res.json();
      exportPdfReport(c, markdown, dcf);
      setOpen(false);
    } catch (err: any) {
      toast.error(`PDF export failed: ${err?.message ?? "Network error"}`);
    } finally {
      setPdfLoading(false);
    }
  }

  return (
    <div ref={ref} className="relative flex items-center gap-2">
      <button
        onClick={() => ready && exportExcelModel(c, forecast, dcf, f)}
        disabled={!ready}
        title={
          ready
            ? "Download full multi-sheet Excel model"
            : "Model still loading…"
        }
        className="h-9 px-3 rounded bg-amber-500 hover:bg-amber-400 disabled:opacity-50 disabled:cursor-not-allowed text-black text-sm font-semibold flex items-center gap-1.5 shadow"
      >
        <FileSpreadsheet className="w-4 h-4" /> Download Excel Model
      </button>
      <button
        onClick={() => setOpen(!open)}
        className="h-9 px-3 rounded bg-secondary border border-border hover:bg-accent text-sm flex items-center gap-1.5"
      >
        <Download className="w-4 h-4" /> Export
      </button>
      {open && (
        <div className="absolute right-0 top-11 panel w-56 p-1 z-20 shadow-lg">
          <ExportItem
            icon={<FileSpreadsheet className="w-4 h-4" />}
            label="Excel Model (.xlsx)"
            onClick={() => {
              exportExcelModel(c, forecast, dcf, f);
              setOpen(false);
            }}
          />
          <ExportItem
            icon={
              pdfLoading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <FileText className="w-4 h-4" />
              )
            }
            label={pdfLoading ? "Generating report…" : "PDF Research Report"}
            onClick={pdfLoading ? () => {} : handlePdfExport}
            disabled={pdfLoading}
          />
          <ExportItem
            icon={<Presentation className="w-4 h-4" />}
            label="PowerPoint Memo"
            onClick={async () => {
              await exportPptxMemo(c, dcf, memo);
              setOpen(false);
            }}
          />
        </div>
      )}
    </div>
  );
}

function ExportItem({
  icon,
  label,
  onClick,
  disabled,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-secondary rounded text-left disabled:opacity-60 disabled:cursor-not-allowed"
    >
      <span className="text-muted-foreground">{icon}</span>
      {label}
    </button>
  );
}

/* ----------------------------- LAYMAN GUIDE ----------------------------- */

function LaymanGuide({
  companyName,
  ticker,
}: {
  companyName: string;
  ticker: string;
}) {
  return (
    <div className="max-w-4xl mx-auto space-y-10 py-4">
      <header className="space-y-3">
        <div className="ticker-chip text-amber inline-block">
          START HERE · NO FINANCE BACKGROUND NEEDED
        </div>
        <h2 className="text-3xl font-semibold tracking-tight">
          How to build a financial model — explained like you've never seen one.
        </h2>
        <p className="text-muted-foreground leading-relaxed">
          A financial model is a spreadsheet (or, here, an app) that takes a
          company's <em>past</em> numbers, makes reasonable guesses about its{" "}
          <em>future</em>, and uses both to estimate what one share of the
          company is truly worth today. That's the whole game. Below is every
          step, in order, for{" "}
          <span className="text-foreground font-semibold">
            {companyName} ({ticker})
          </span>{" "}
          — and any other company you ever look at.
        </p>
      </header>

      <Step n="0" title="Why are we even doing this?">
        <p>
          The stock market gives every company a price every second. That price
          reflects <em>opinion</em>, not always truth. A financial model answers
          one question:{" "}
          <strong>
            "Based on the actual business, what should this company be worth?"
          </strong>{" "}
          If your fair value is higher than the market price → it may be
          undervalued (buy candidate). If lower → overvalued (avoid / sell
          candidate). Everything else is detail.
        </p>
      </Step>

      <Step n="1" title="Collect the raw data (where to get it, free)">
        <p>
          You need <strong>5 years of historical financial statements</strong>.
          Free sources, in order of ease:
        </p>
        <Bullets
          items={[
            [
              "screener.in",
              "Cleanest free view of P&L, Balance Sheet, Cash Flow, ratios. Search the ticker, scroll down.",
            ],
            [
              "Company website → Investor Relations",
              "Annual Reports (PDF). The most authoritative source — every number is audited.",
            ],
            [
              "nseindia.com / bseindia.com",
              "Corporate filings, shareholding pattern, quarterly results.",
            ],
            [
              "moneycontrol.com / tickertape.in",
              "Quick ratios and peer comparisons.",
            ],
            [
              "tijorifinance.com",
              "Sector/segment breakdowns (paid for deep data).",
            ],
          ]}
        />
        <Tip>
          For this prototype Vidura uses synthesized illustrative numbers, but
          in real life you'd download the last 5 annual reports and copy the
          three statements into your model.
        </Tip>
      </Step>

      <Step n="2" title="Which data exactly? (the three statements + drivers)">
        <p>
          Every financial model is built on three statements. They are linked —
          change one number and the others move.
        </p>

        <SubBlock title="A. Income Statement (Profit & Loss / P&L)">
          <p className="text-muted-foreground text-sm mb-2">
            "Did the company make money this year?"
          </p>
          <Bullets
            items={[
              [
                "Revenue (Sales)",
                "Top line — total money received from selling products/services.",
              ],
              [
                "COGS (Cost of Goods Sold)",
                "Direct cost to make/buy what was sold.",
              ],
              ["Gross Profit", "Revenue − COGS."],
              [
                "Operating expenses (SG&A)",
                "Salaries, rent, marketing, admin.",
              ],
              [
                "EBITDA",
                "Earnings before interest, tax, depreciation & amortization.",
              ],
              [
                "D&A (Depreciation & Amortization)",
                "Non-cash wear-and-tear charge on assets.",
              ],
              ["EBIT (Operating Profit)", "EBITDA − D&A."],
              ["Interest expense", "Cost of debt."],
              ["Tax", "What the government takes."],
              [
                "PAT (Net Profit)",
                "Bottom line — what's left for shareholders.",
              ],
              ["EPS", "PAT ÷ number of shares = profit per share."],
            ]}
          />
        </SubBlock>

        <SubBlock title="B. Balance Sheet">
          <p className="text-muted-foreground text-sm mb-2">
            "What does the company own and owe — right now?"
          </p>
          <Bullets
            items={[
              [
                "Assets",
                "Cash, receivables (money owed by customers), inventory, PP&E (factories/machines), investments.",
              ],
              [
                "Liabilities",
                "Payables (money owed to suppliers), short-term debt, long-term debt, other obligations.",
              ],
              [
                "Equity",
                "What truly belongs to shareholders. Assets − Liabilities = Equity. Always.",
              ],
            ]}
          />
        </SubBlock>

        <SubBlock title="C. Cash Flow Statement">
          <p className="text-muted-foreground text-sm mb-2">
            "Profit ≠ cash. Where did cash actually go?"
          </p>
          <Bullets
            items={[
              [
                "CFO (Cash from Operations)",
                "Cash generated by running the business. Should be close to PAT + D&A in a healthy company.",
              ],
              [
                "CFI (Cash from Investing)",
                "Mostly Capex — money spent on new factories, machines, acquisitions.",
              ],
              [
                "CFF (Cash from Financing)",
                "Debt raised/repaid, dividends paid, share buybacks/issues.",
              ],
              [
                "FCF (Free Cash Flow)",
                "CFO − Capex. The single most important number in valuation.",
              ],
            ]}
          />
        </SubBlock>

        <SubBlock title="D. Market & assumption inputs">
          <Bullets
            items={[
              [
                "Current share price (CMP)",
                "From NSE/BSE — needed to compare with your fair value.",
              ],
              ["Shares outstanding", "From the annual report."],
              [
                "Beta",
                "How wildly the stock moves vs the market. Found on Yahoo Finance / NSE.",
              ],
              [
                "Risk-free rate",
                "10-year government bond yield (~7% in India).",
              ],
              ["Equity risk premium", "~6–7% for India."],
            ]}
          />
        </SubBlock>
      </Step>

      <Step n="3" title="Fill in the historical numbers (5 years)">
        <p>
          Type the last 5 years of P&L, Balance Sheet, and Cash Flow into your
          model — one column per year, oldest on the left. Don't compute
          anything yet; just <em>copy what the annual report says</em>. The
          output: a clean historical record you can stare at.
        </p>
        <p className="text-sm text-muted-foreground">
          <strong className="text-foreground">In Vidura:</strong> this is
          already done for you under the <em>Financials</em> tab. Look at the
          Revenue row across FY20→FY24 — that's exactly what you'd type.
        </p>
      </Step>

      <Step n="4" title="Calculate ratios — turn raw data into insight">
        <p>
          Ratios let you compare companies of different sizes and judge quality.
          The essentials:
        </p>
        <Bullets
          items={[
            [
              "Gross / EBITDA / Net margin",
              "Profitability at different layers. Higher = better.",
            ],
            [
              "ROE (Return on Equity)",
              "Net profit ÷ Equity. Above 15% is good. Buffett's favorite.",
            ],
            [
              "ROCE (Return on Capital Employed)",
              "Operating profit ÷ (Equity + Debt). Measures efficiency of all capital.",
            ],
            [
              "Debt / Equity",
              "How leveraged is the balance sheet? &gt; 1 is risky for most sectors.",
            ],
            [
              "Current ratio",
              "Short-term assets ÷ short-term liabilities. &gt; 1 = can pay near-term bills.",
            ],
            [
              "Asset turnover",
              "Revenue ÷ Total Assets. How hard is the company sweating its assets?",
            ],
          ]}
        />
        <Tip>
          <strong className="text-foreground">In Vidura:</strong> the{" "}
          <em>Dashboard</em> and <em>Financials → Ratios</em> tabs compute all
          of these for you. Look for ratios that are{" "}
          <em>improving year-over-year</em> — that's the sign of a strengthening
          business.
        </Tip>
      </Step>

      <Step n="5" title="Build the forecast (your guess about the future)">
        <p>
          Now project the next 5 years. You're not predicting the future —
          you're making <em>defensible assumptions</em>. The model amplifies
          them into full statements. The handful of inputs that drive
          everything:
        </p>
        <Bullets
          items={[
            [
              "Revenue growth %",
              "How fast will sales grow? Look at: past growth, industry growth, management guidance.",
            ],
            [
              "EBITDA margin %",
              "Will profitability hold, expand, or compress?",
            ],
            [
              "Tax rate",
              "Usually stable — use the recent historical average (~25% in India).",
            ],
            [
              "Capex / Revenue %",
              "How much will the company reinvest? Capital-heavy businesses (steel, telecom) = high; software = low.",
            ],
            [
              "Working capital",
              "Days of receivables, inventory, payables — drives cash needs.",
            ],
            [
              "Terminal growth rate",
              "Long-term growth into infinity. Use 3–5% (must be ≤ GDP growth).",
            ],
          ]}
        />
        <Tip>
          <strong className="text-foreground">In Vidura:</strong> the{" "}
          <em>Forecast</em> tab gives you sliders for every one of these. Move
          them and watch every downstream number — including the fair value —
          recompute in real time.
        </Tip>
      </Step>

      <Step n="6" title="Value the company — DCF (Discounted Cash Flow)">
        <p>
          DCF is the king of valuation. The idea in one line:{" "}
          <strong>a rupee tomorrow is worth less than a rupee today</strong>, so
          we discount all the future free cash the company will ever generate
          back to today's value.
        </p>
        <ol className="list-decimal pl-5 space-y-2 text-sm">
          <li>Forecast Free Cash Flow (FCF) for 5–10 years (Step 5).</li>
          <li>
            Calculate <strong>WACC</strong> (Weighted Average Cost of Capital) —
            the discount rate.
            <div className="mt-1 font-mono text-xs bg-secondary/50 p-2 rounded">
              WACC = (E/V)·Re + (D/V)·Rd·(1−Tax)
            </div>
          </li>
          <li>
            Discount each year's FCF:{" "}
            <span className="font-mono">FCF / (1+WACC)^year</span>.
          </li>
          <li>
            Compute <strong>Terminal Value</strong> = FCF<sub>final</sub> ×
            (1+g) / (WACC − g). Discount it too.
          </li>
          <li>
            Add all discounted FCFs + discounted Terminal Value ={" "}
            <strong>Enterprise Value</strong>.
          </li>
          <li>
            Subtract net debt, divide by shares →{" "}
            <strong>Intrinsic value per share</strong>.
          </li>
          <li>
            Compare with CMP. Higher → undervalued. Lower → overvalued. The gap
            is your <em>margin of safety</em>.
          </li>
        </ol>
        <Tip>
          <strong className="text-foreground">In Vidura:</strong> the{" "}
          <em>Valuation</em> tab shows the full WACC build, year-by-year
          discounted FCF, terminal value, and the final ₹ per share — for{" "}
          {companyName}.
        </Tip>
      </Step>

      <Step n="7" title="Cross-check with Relative Valuation">
        <p>
          DCF can be wrong if your assumptions are wrong. So check it against
          how peers are priced:
        </p>
        <Bullets
          items={[
            [
              "P/E (Price / Earnings)",
              "Most common. How many years of profit equals one share's price?",
            ],
            [
              "EV/EBITDA",
              "Cleaner than P/E because it ignores capital structure.",
            ],
            [
              "P/B (Price / Book)",
              "Critical for banks and financial companies.",
            ],
            ["EV/Sales", "Used for high-growth, not-yet-profitable companies."],
          ]}
        />
        <p className="text-sm">
          Compare {ticker}'s multiples vs its peers. Trading at a discount with
          similar quality? Possible bargain. At a premium? Need a reason (better
          growth, margins, brand).
        </p>
      </Step>

      <Step n="8" title="Sensitivity & Scenarios — stress-test the answer">
        <p>
          No model is right. Run "what-ifs": what if WACC is 1% higher? What if
          growth disappoints by 3%? Build three scenarios —{" "}
          <strong>Bear, Base, Bull</strong> — and quote your fair value as a{" "}
          <em>range</em>, not a single number.
        </p>
        <p className="text-sm text-muted-foreground">
          <strong className="text-foreground">In Vidura:</strong> Full Model §
          Sensitivity (WACC × growth grid) and § Scenarios (Bear/Base/Bull
          cards) do this automatically.
        </p>
      </Step>

      <Step n="9" title="Write the research note — the investment thesis">
        <p>
          A model is useless if you can't explain it. Every research report
          follows the same structure:
        </p>
        <Bullets
          items={[
            [
              "1. Investment Thesis",
              "Why is this stock interesting? In 3 bullets.",
            ],
            [
              "2. Business Description",
              "What does the company actually do and how does it make money?",
            ],
            [
              "3. Industry & Competitive Position",
              "Market size, share, moat, competitors.",
            ],
            [
              "4. Financial Analysis",
              "Historical performance summary from your model.",
            ],
            ["5. Forecast & Assumptions", "Key drivers, justified."],
            [
              "6. Valuation",
              "DCF fair value + relative valuation, target price.",
            ],
            ["7. Key Risks", "What could break the thesis."],
            [
              "8. Recommendation",
              "BUY / HOLD / SELL with target price and time horizon.",
            ],
          ]}
        />
        <Tip>
          <strong className="text-foreground">In Vidura:</strong> the{" "}
          <em>Research</em> tab generates this report for {companyName} using AI
          — grounded in the numbers from your model.
        </Tip>
      </Step>

      <Step n="10" title="The endpoint — make a decision">
        <p>
          The model is not the answer — it's the{" "}
          <em>tool that gives you the answer</em>. After all this work, you
          should be able to say one sentence:
        </p>
        <blockquote className="border-l-2 border-primary pl-4 py-2 text-foreground/90 italic">
          "My fair value for {ticker} is ₹X, the stock trades at ₹Y, so I rate
          it BUY/HOLD/SELL with target ₹X over 12 months — assuming Z growth and
          W margins hold."
        </blockquote>
        <p>
          Re-run the model every quarter when new results come out. Update the
          historical column, re-test assumptions, revise fair value. That's it.
          That's investment banking.
        </p>
      </Step>

      <section className="panel p-6 space-y-3">
        <div className="ticker-chip text-amber">NEXT STEPS</div>
        <h3 className="text-xl font-semibold">Now do it yourself</h3>
        <ol className="list-decimal pl-5 text-sm text-muted-foreground space-y-1.5">
          <li>
            Open the <em>Full Model</em> tab and scroll top-to-bottom — every
            step above maps to a section.
          </li>
          <li>
            Hit the <em>Forecast</em> tab and move one slider. Watch the
            intrinsic price change. That's the model breathing.
          </li>
          <li>
            Switch to <em>AI Analyst</em> and ask:{" "}
            <em>"Why does {ticker}'s DCF differ from its CMP?"</em>
          </li>
          <li>
            Export the Excel model and study the formulas. That's the single
            fastest way to truly learn.
          </li>
        </ol>
      </section>
    </div>
  );
}

function Step({
  n,
  title,
  children,
}: {
  n: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <div className="flex items-baseline gap-3">
        <span className="font-mono text-xs text-amber tracking-widest">
          STEP {n}
        </span>
      </div>
      <h3 className="text-xl md:text-2xl font-semibold tracking-tight">
        {title}
      </h3>
      <div className="text-sm text-foreground/85 leading-relaxed space-y-3">
        {children}
      </div>
    </section>
  );
}

function SubBlock({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="panel p-4 space-y-2">
      <h4 className="font-semibold text-sm">{title}</h4>
      {children}
    </div>
  );
}

function Bullets({ items }: { items: [string, string][] }) {
  return (
    <ul className="space-y-1.5 text-sm">
      {items.map(([k, v]) => (
        <li key={k} className="flex gap-2">
          <span className="text-amber mt-1">▸</span>
          <span>
            <strong className="text-foreground">{k}</strong>{" "}
            <span className="text-muted-foreground">— {v}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}

function Tip({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="panel p-3 text-sm flex gap-2 items-start"
      style={{
        borderColor: "color-mix(in oklab, var(--primary) 35%, transparent)",
        background: "color-mix(in oklab, var(--primary) 6%, transparent)",
      }}
    >
      <Sparkles className="w-4 h-4 text-primary shrink-0 mt-0.5" />
      <div>{children}</div>
    </div>
  );
}

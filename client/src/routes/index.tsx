import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  Search,
  TrendingUp,
  BarChart3,
  Sparkles,
  FileText,
  Brain,
} from "lucide-react";
import { COMPANIES } from "@shared/data/companies";
import { searchUniverse, UNIVERSE } from "@shared/data/universe";
import { relativeValuation } from "@shared/lib/financials";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Vidura — AI Equity Research for Indian Markets" },
      {
        name: "description",
        content:
          "Institutional-grade financial models, DCF valuation, and AI research reports for any NSE/BSE listed company. Enter a ticker, get a complete equity research workspace.",
      },
      { property: "og:title", content: "Vidura — AI Equity Research" },
      {
        property: "og:description",
        content:
          "Financial modeling, forecasting, DCF valuation and AI research reports for Indian stocks.",
      },
    ],
  }),
  component: Home,
});

function Home() {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(0);
  const navigate = useNavigate();

  const suggestions = useMemo(() => searchUniverse(q, 10), [q]);
  const match = suggestions[0];

  const go = (ticker: string) =>
    navigate({ to: "/company/$ticker", params: { ticker } });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const pick = suggestions[hi] ?? suggestions[0];
    if (pick) go(pick.ticker);
  };

  const onKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!suggestions.length) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHi((h) => Math.min(h + 1, suggestions.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHi((h) => Math.max(h - 1, 0));
    } else if (e.key === "Escape") setOpen(false);
  };

  return (
    <div className="min-h-screen">
      <header className="border-b border-border/60 backdrop-blur-sm sticky top-0 z-10 bg-background/80">
        <div className="max-w-7xl mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded bg-primary text-primary-foreground grid place-items-center font-mono font-bold text-sm">
              V
            </div>
            <span className="font-semibold tracking-tight">Vidura</span>
            <span className="ticker-chip text-muted-foreground ml-2">
              EQUITY · IN
            </span>
          </div>
          <nav className="text-sm text-muted-foreground flex gap-6">
            <a href="#coverage" className="hover:text-foreground transition">
              Coverage
            </a>
            <a href="#features" className="hover:text-foreground transition">
              Engine
            </a>
          </nav>
        </div>
      </header>

      <section className="max-w-7xl mx-auto px-6 pt-20 pb-16">
        <div className="max-w-3xl">
          <div className="inline-flex items-center gap-2 ticker-chip mb-6">
            <Sparkles className="w-3 h-3 text-amber" /> POWERED BY AI · SEEDED
            DATA
          </div>
          <h1 className="text-5xl md:text-6xl font-semibold tracking-tight leading-[1.05]">
            Institutional-grade equity research,
            <br />
            <span className="text-amber">on demand.</span>
          </h1>
          <p className="mt-6 text-lg text-muted-foreground max-w-2xl">
            Type any Indian company name or NSE ticker. Vidura assembles a
            fully-linked 3-statement model, 5-year forecast, DCF + sensitivity,
            scenario analysis, and an AI research note — in one click.
          </p>

          <form onSubmit={submit} className="mt-10 relative max-w-2xl">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground z-10" />
            <input
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setOpen(true);
                setHi(0);
              }}
              onFocus={() => setOpen(true)}
              onBlur={() => setTimeout(() => setOpen(false), 150)}
              onKeyDown={onKey}
              placeholder="Type a name or ticker — T, TC, TATA, REL, HDFC…"
              className="w-full h-14 pl-12 pr-48 rounded-md bg-card border border-border focus:border-primary focus:ring-2 focus:ring-primary/30 outline-none font-mono text-base"
            />
            <button
              type="submit"
              disabled={!match && !suggestions.length}
              className="absolute right-2 top-2 h-10 px-4 rounded bg-primary text-primary-foreground font-medium disabled:opacity-40 hover:opacity-90 transition flex items-center gap-1.5 z-10"
            >
              <FileText className="w-4 h-4" /> Build Full Model
            </button>
            {open && suggestions.length > 0 && (
              <div className="absolute left-0 right-0 top-[60px] panel p-1 max-h-80 overflow-auto z-20">
                {suggestions.map((c, i) => (
                  <button
                    key={c.ticker}
                    type="button"
                    onMouseEnter={() => setHi(i)}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      go(c.ticker);
                    }}
                    className={`w-full flex items-center justify-between gap-3 px-3 py-2 rounded text-left transition ${i === hi ? "bg-secondary" : "hover:bg-secondary/60"}`}
                  >
                    <div className="min-w-0">
                      <div className="text-sm font-medium truncate">
                        {c.name}
                      </div>
                      <div className="text-[11px] text-muted-foreground font-mono">
                        {c.isin}
                      </div>
                    </div>
                    <span className="ticker-chip text-amber shrink-0">
                      {c.ticker}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </form>
          {q && !suggestions.length && (
            <p className="mt-3 text-sm text-muted-foreground font-mono">
              No match in NSE universe (
              {UNIVERSE.length.toLocaleString("en-IN")} listed companies).
            </p>
          )}
          {!q && (
            <p className="mt-3 text-sm text-muted-foreground">
              Covering all{" "}
              <span className="text-amber font-mono">
                {UNIVERSE.length.toLocaleString("en-IN")}
              </span>{" "}
              NSE-listed companies. Prototype data.
            </p>
          )}
        </div>
      </section>

      <section id="coverage" className="max-w-7xl mx-auto px-6 pb-20">
        <div className="flex items-end justify-between mb-6">
          <div>
            <div className="text-xs font-mono text-muted-foreground tracking-wider">
              COVERAGE · 10 COMPANIES
            </div>
            <h2 className="text-2xl font-semibold mt-1">Nifty large caps</h2>
          </div>
          <span className="text-xs text-muted-foreground">
            Click any ticker to open its workspace
          </span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {COMPANIES.map((c) => {
            const r = relativeValuation(c);
            return (
              <Link
                key={c.ticker}
                to="/company/$ticker"
                params={{ ticker: c.ticker }}
                className="panel p-4 hover:border-primary/60 hover:bg-card/80 transition group"
              >
                <div className="flex items-start justify-between">
                  <div className="min-w-0">
                    <div className="font-semibold truncate">{c.name}</div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {c.sector}
                    </div>
                  </div>
                  <span className="ticker-chip text-amber">{c.ticker}</span>
                </div>
                <div className="mt-4 grid grid-cols-3 gap-2 text-xs">
                  <Stat
                    label="CMP"
                    value={`₹${c.cmp.toLocaleString("en-IN")}`}
                  />
                  <Stat
                    label="MCap"
                    value={`₹${(r.marketCap / 1e5).toFixed(1)}L Cr`}
                  />
                  <Stat label="PE" value={`${r.pe.toFixed(1)}x`} />
                </div>
              </Link>
            );
          })}
        </div>
      </section>

      <section id="features" className="border-t border-border/60 bg-card/30">
        <div className="max-w-7xl mx-auto px-6 py-20 grid md:grid-cols-3 gap-8">
          <Feature
            icon={<BarChart3 />}
            title="3-Statement Engine"
            text="Fully linked Income, Balance Sheet and Cash Flow built from 5 years of historicals — with ratios, margins and FCF derived automatically."
          />
          <Feature
            icon={<TrendingUp />}
            title="Forecast + DCF"
            text="Editable assumptions drive a 5–10 year forecast. WACC, terminal value, intrinsic price and margin of safety update live."
          />
          <Feature
            icon={<Brain />}
            title="AI Analyst"
            text="A grounded research note plus a chat analyst that can debate valuation, compare peers and stress-test margins — citing your data."
          />
        </div>
      </section>

      <footer className="border-t border-border/60">
        <div className="max-w-7xl mx-auto px-6 py-8 text-xs text-muted-foreground flex flex-wrap justify-between gap-3">
          <span>
            Vidura — AI Equity Research Platform. v1 uses seeded data, not live
            market feeds.
          </span>
          <span>
            Not investment advice. For research and educational use only.
          </span>
        </div>
      </footer>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col">
      <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
      <span className="num text-foreground">{value}</span>
    </div>
  );
}

function Feature({
  icon,
  title,
  text,
}: {
  icon: React.ReactNode;
  title: string;
  text: string;
}) {
  return (
    <div>
      <div className="w-10 h-10 rounded bg-secondary border border-border grid place-items-center text-primary mb-4">
        {icon}
      </div>
      <h3 className="text-lg font-semibold">{title}</h3>
      <p className="text-sm text-muted-foreground mt-2 leading-relaxed">
        {text}
      </p>
    </div>
  );
}

// suppress unused warning

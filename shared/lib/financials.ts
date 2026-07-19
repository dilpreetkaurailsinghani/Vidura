import type { Company, FYRow } from "../data/companies";

export type IncomeRow = {
  year: string;
  revenue: number; cogs: number; grossProfit: number; opex: number;
  ebitda: number; da: number; ebit: number; interest: number; otherIncome: number;
  pbt: number; tax: number; pat: number; eps: number;
};

export type BalanceRow = {
  year: string;
  cash: number; receivables: number; inventory: number; otherCA: number; currentAssets: number;
  ppe: number; otherNCA: number; nonCurrentAssets: number; totalAssets: number;
  payables: number; shortDebt: number; otherCL: number; currentLiabilities: number;
  longDebt: number; otherNCL: number; nonCurrentLiabilities: number;
  equity: number; totalLiabEquity: number; check: number;
};

export type CashFlowRow = {
  year: string;
  pat: number; da: number; wcChange: number; cfo: number;
  capex: number; cfi: number;
  debtChange: number; dividends: number; cff: number;
  netCash: number; fcf: number;
};

export type Ratios = {
  year: string;
  grossMargin: number; ebitdaMargin: number; ebitMargin: number; netMargin: number;
  roe: number; roce: number; debtEquity: number; currentRatio: number; assetTurnover: number;
};

export type Forecast = {
  revenueGrowth: number;       // % yoy
  ebitdaMargin: number;        // % of revenue
  daPctRevenue: number;
  capexPctRevenue: number;
  wcPctRevenue: number;        // NWC / revenue
  taxRate: number;             // %
  interestRate: number;        // % of avg debt (pre-tax)
  years: number;               // 5..10
};

export function buildIncome(rows: FYRow[], shares: number): IncomeRow[] {
  return rows.map((r) => {
    const grossProfit = r.revenue - r.cogs;
    const ebitda = grossProfit - r.opex;
    const ebit = ebitda - r.da;
    const pbt = ebit - r.interest + r.otherIncome;
    const pat = pbt - r.tax;
    return {
      year: r.year, revenue: r.revenue, cogs: r.cogs, grossProfit,
      opex: r.opex, ebitda, da: r.da, ebit,
      interest: r.interest, otherIncome: r.otherIncome,
      pbt, tax: r.tax, pat, eps: pat / shares,
    };
  });
}

export function buildBalance(rows: FYRow[]): BalanceRow[] {
  return rows.map((r) => {
    const currentAssets = r.cash + r.receivables + r.inventory + r.otherCA;
    const nonCurrentAssets = r.ppe + r.otherNCA;
    const totalAssets = currentAssets + nonCurrentAssets;
    const currentLiabilities = r.payables + r.shortDebt + r.otherCL;
    const nonCurrentLiabilities = r.longDebt + r.otherNCL;
    const totalLiabEquity = currentLiabilities + nonCurrentLiabilities + r.equity;
    return {
      year: r.year, cash: r.cash, receivables: r.receivables, inventory: r.inventory, otherCA: r.otherCA,
      currentAssets, ppe: r.ppe, otherNCA: r.otherNCA, nonCurrentAssets, totalAssets,
      payables: r.payables, shortDebt: r.shortDebt, otherCL: r.otherCL, currentLiabilities,
      longDebt: r.longDebt, otherNCL: r.otherNCL, nonCurrentLiabilities,
      equity: r.equity, totalLiabEquity, check: totalAssets - totalLiabEquity,
    };
  });
}

export function buildCashFlow(rows: FYRow[], income: IncomeRow[]): CashFlowRow[] {
  return rows.map((r, i) => {
    const prev = i > 0 ? rows[i - 1] : r;
    const wcCurr = (r.receivables + r.inventory) - r.payables;
    const wcPrev = (prev.receivables + prev.inventory) - prev.payables;
    const wcChange = wcCurr - wcPrev;
    const cfo = income[i].pat + r.da - wcChange;
    const cfi = -r.capex;
    const debtChange = (r.longDebt + r.shortDebt) - (prev.longDebt + prev.shortDebt);
    const cff = debtChange - r.dividends;
    const netCash = cfo + cfi + cff;
    const fcf = cfo + cfi;
    return { year: r.year, pat: income[i].pat, da: r.da, wcChange, cfo, capex: r.capex, cfi, debtChange, dividends: r.dividends, cff, netCash, fcf };
  });
}

export function buildRatios(income: IncomeRow[], balance: BalanceRow[], rows: FYRow[]): Ratios[] {
  return income.map((r, i) => {
    const b = balance[i];
    const debt = rows[i].longDebt + rows[i].shortDebt;
    const capEmployed = b.equity + debt;
    return {
      year: r.year,
      grossMargin: r.grossProfit / r.revenue,
      ebitdaMargin: r.ebitda / r.revenue,
      ebitMargin: r.ebit / r.revenue,
      netMargin: r.pat / r.revenue,
      roe: r.pat / b.equity,
      roce: r.ebit / capEmployed,
      debtEquity: debt / b.equity,
      currentRatio: b.currentAssets / Math.max(b.currentLiabilities, 1),
      assetTurnover: r.revenue / b.totalAssets,
    };
  });
}

export function defaultForecast(c: Company): Forecast {
  const inc = buildIncome(c.history, c.history[0].shares);
  const last = inc[inc.length - 1];
  const first = inc[0];
  const yrs = inc.length - 1;
  const cagr = Math.pow(last.revenue / first.revenue, 1 / yrs) - 1;
  return {
    revenueGrowth: Math.min(Math.max(cagr * 100, 4), 18),
    ebitdaMargin: (last.ebitda / last.revenue) * 100,
    daPctRevenue: (last.da / last.revenue) * 100,
    capexPctRevenue: (c.history[c.history.length - 1].capex / last.revenue) * 100,
    wcPctRevenue: 10,
    taxRate: c.taxRate * 100,
    interestRate: c.costOfDebt * 100,
    years: 5,
  };
}

export type ForecastRow = {
  year: string;
  revenue: number; ebitda: number; da: number; ebit: number;
  interest: number; pbt: number; tax: number; pat: number;
  capex: number; wc: number; wcChange: number; fcf: number;
};

export function projectForecast(c: Company, f: Forecast): ForecastRow[] {
  const inc = buildIncome(c.history, c.history[c.history.length - 1].shares);
  const last = inc[inc.length - 1];
  const lastRow = c.history[c.history.length - 1];
  const lastDebt = lastRow.longDebt + lastRow.shortDebt;
  const lastWc = f.wcPctRevenue / 100 * last.revenue;
  const rows: ForecastRow[] = [];
  let rev = last.revenue;
  let wcPrev = lastWc;
  const baseYear = parseInt(last.year.slice(2)) + 2000;
  for (let i = 1; i <= f.years; i++) {
    rev = rev * (1 + f.revenueGrowth / 100);
    const ebitda = rev * f.ebitdaMargin / 100;
    const da = rev * f.daPctRevenue / 100;
    const ebit = ebitda - da;
    const interest = lastDebt * f.interestRate / 100;
    const pbt = ebit - interest;
    const tax = Math.max(pbt, 0) * f.taxRate / 100;
    const pat = pbt - tax;
    const capex = rev * f.capexPctRevenue / 100;
    const wc = rev * f.wcPctRevenue / 100;
    const wcChange = wc - wcPrev;
    const fcf = ebit * (1 - f.taxRate / 100) + da - capex - wcChange; // unlevered FCF
    wcPrev = wc;
    rows.push({
      year: `FY${(baseYear + i).toString().slice(2)}E`,
      revenue: rev, ebitda, da, ebit, interest, pbt, tax, pat,
      capex, wc, wcChange, fcf,
    });
  }
  return rows;
}

export type DCFInputs = {
  beta: number; riskFreeRate: number; marketRiskPremium: number;
  costOfDebt: number; taxRate: number;
  debtWeight: number;   // % of capital
  terminalGrowth: number;
};

export function defaultDCFInputs(c: Company): DCFInputs {
  const last = c.history[c.history.length - 1];
  const debt = last.longDebt + last.shortDebt;
  const debtWeight = debt / (debt + last.equity);
  return {
    beta: c.beta,
    riskFreeRate: c.riskFreeRate * 100,
    marketRiskPremium: c.marketRiskPremium * 100,
    costOfDebt: c.costOfDebt * 100,
    taxRate: c.taxRate * 100,
    debtWeight: debtWeight * 100,
    terminalGrowth: 4.5,
  };
}

export type DCFResult = {
  wacc: number; costOfEquity: number;
  pvFcf: number; terminalValue: number; pvTerminal: number;
  enterpriseValue: number; netDebt: number; equityValue: number;
  intrinsicPrice: number; upside: number;
  yearlyPV: { year: string; fcf: number; pv: number }[];
};

export function runDCF(c: Company, forecast: ForecastRow[], d: DCFInputs): DCFResult {
  const costOfEquity = (d.riskFreeRate + d.beta * d.marketRiskPremium) / 100;
  const afterTaxKd = (d.costOfDebt / 100) * (1 - d.taxRate / 100);
  const w = d.debtWeight / 100;
  const wacc = afterTaxKd * w + costOfEquity * (1 - w);
  const yearlyPV = forecast.map((r, i) => ({
    year: r.year, fcf: r.fcf, pv: r.fcf / Math.pow(1 + wacc, i + 1),
  }));
  const pvFcf = yearlyPV.reduce((s, x) => s + x.pv, 0);
  const last = forecast[forecast.length - 1];
  const terminalValue = (last.fcf * (1 + d.terminalGrowth / 100)) / (wacc - d.terminalGrowth / 100);
  const pvTerminal = terminalValue / Math.pow(1 + wacc, forecast.length);
  const enterpriseValue = pvFcf + pvTerminal;
  const lastRow = c.history[c.history.length - 1];
  const netDebt = lastRow.longDebt + lastRow.shortDebt - lastRow.cash;
  const equityValue = enterpriseValue - netDebt;
  const intrinsicPrice = (equityValue * 1) / lastRow.shares; // crores * 1cr / cr shares = rs/share
  return {
    wacc, costOfEquity, pvFcf, terminalValue, pvTerminal,
    enterpriseValue, netDebt, equityValue, intrinsicPrice,
    upside: (intrinsicPrice - c.cmp) / c.cmp,
    yearlyPV,
  };
}

export function relativeValuation(c: Company) {
  const inc = buildIncome(c.history, c.history[c.history.length - 1].shares);
  const last = inc[inc.length - 1];
  const lastRow = c.history[c.history.length - 1];
  const mcap = c.cmp * lastRow.shares;
  const debt = lastRow.longDebt + lastRow.shortDebt;
  const ev = mcap + debt - lastRow.cash;
  const book = lastRow.equity;
  return {
    pe: c.cmp / last.eps,
    pb: mcap / book,
    evEbitda: ev / last.ebitda,
    evRevenue: ev / last.revenue,
    marketCap: mcap,
    enterpriseValue: ev,
    netDebt: debt - lastRow.cash,
  };
}

export function sensitivity(c: Company, fc: ForecastRow[], d: DCFInputs) {
  const waccs = [-2, -1, 0, 1, 2].map((delta) => {
    const base = runDCF(c, fc, d).wacc * 100;
    return +(base + delta).toFixed(2);
  });
  const tgs = [-1.5, -0.75, 0, 0.75, 1.5].map((delta) => +(d.terminalGrowth + delta).toFixed(2));
  // Build matrix by tweaking WACC via riskFreeRate offsets
  const baseWacc = runDCF(c, fc, d).wacc * 100;
  const matrix = tgs.map((tg) =>
    waccs.map((w) => {
      const rfShift = w - baseWacc;
      const inputs: DCFInputs = { ...d, riskFreeRate: d.riskFreeRate + rfShift, terminalGrowth: tg };
      return runDCF(c, fc, inputs).intrinsicPrice;
    }),
  );
  return { waccs, tgs, matrix };
}

export function scenarios(c: Company, base: Forecast, d: DCFInputs) {
  const variants = [
    { name: "Bear", revShift: -4, marginShift: -3 },
    { name: "Base", revShift: 0, marginShift: 0 },
    { name: "Bull", revShift: +4, marginShift: +2 },
  ];
  return variants.map((v) => {
    const f: Forecast = { ...base, revenueGrowth: base.revenueGrowth + v.revShift, ebitdaMargin: base.ebitdaMargin + v.marginShift };
    const fc = projectForecast(c, f);
    const r = runDCF(c, fc, d);
    return { name: v.name, growth: f.revenueGrowth, margin: f.ebitdaMargin, price: r.intrinsicPrice, upside: r.upside };
  });
}

export const isBank = (c: Company) => c.sector === "Financials";

export const fmtCr = (n: number) => {
  if (!isFinite(n)) return "—";
  const abs = Math.abs(n);
  if (abs >= 1e5) return `₹${(n / 1e5).toFixed(2)} L Cr`;
  if (abs >= 1e3) return `₹${(n / 1e3).toFixed(2)} K Cr`;
  return `₹${n.toFixed(0)} Cr`;
};
export const fmtPct = (n: number, d = 1) => `${(n * 100).toFixed(d)}%`;
export const fmtPctRaw = (n: number, d = 1) => `${n.toFixed(d)}%`;
export const fmtNum = (n: number, d = 0) => isFinite(n) ? n.toLocaleString("en-IN", { maximumFractionDigits: d, minimumFractionDigits: d }) : "—";
export const fmtMx = (n: number) => isFinite(n) ? `${n.toFixed(1)}x` : "—";
export const fmtRs = (n: number) => isFinite(n) ? `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 0 })}` : "—";

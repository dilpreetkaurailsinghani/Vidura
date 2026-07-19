// All figures in INR Crores unless noted. Seed data approximates published FY annual reports.
// Years are Indian FY (FY ending March).

export type FYRow = {
  year: string; // "FY20" .. "FY24"
  revenue: number;
  cogs: number;
  opex: number;       // SG&A + other opex (excl. D&A)
  da: number;         // depreciation & amortization
  interest: number;
  otherIncome: number;
  tax: number;
  // BS
  cash: number;
  receivables: number;
  inventory: number;
  otherCA: number;
  ppe: number;
  otherNCA: number;
  payables: number;
  shortDebt: number;
  otherCL: number;
  longDebt: number;
  otherNCL: number;
  equity: number;
  // CF
  capex: number;
  dividends: number;
  // Market
  shares: number;     // in crores
};

export type Company = {
  ticker: string;       // NSE
  bse?: string;
  name: string;
  sector: string;
  industry: string;
  description: string;
  cmp: number;          // current market price (INR)
  beta: number;
  taxRate: number;      // effective
  costOfDebt: number;   // pre-tax
  riskFreeRate: number;
  marketRiskPremium: number;
  history: FYRow[];     // chronological, oldest -> newest
  peers: string[];      // tickers
};

const fy = (year: string, base: Partial<FYRow>, full: Omit<FYRow, "year">): FYRow => ({
  year, ...full, ...base,
});

// Helper to generate synthetic but coherent multi-year rows from FY24 anchor + growth.
function build(
  anchor: Omit<FYRow, "year">,
  growthBack: number[], // 4 entries, % yoy growth applied going BACKWARD from FY24 to FY20
): FYRow[] {
  const years = ["FY20", "FY21", "FY22", "FY23", "FY24"];
  const rows: FYRow[] = [{ year: "FY24", ...anchor }];
  let prev = anchor;
  for (let i = 0; i < 4; i++) {
    const g = 1 + growthBack[i] / 100;
    const r: Omit<FYRow, "year"> = {
      revenue: prev.revenue / g,
      cogs: prev.cogs / g,
      opex: prev.opex / g,
      da: prev.da / (1 + (growthBack[i] - 2) / 100),
      interest: prev.interest / (1 + (growthBack[i] - 4) / 100),
      otherIncome: prev.otherIncome / g,
      tax: prev.tax / g,
      cash: prev.cash / (1 + (growthBack[i] + 1) / 100),
      receivables: prev.receivables / g,
      inventory: prev.inventory / g,
      otherCA: prev.otherCA / g,
      ppe: prev.ppe / (1 + (growthBack[i] - 1) / 100),
      otherNCA: prev.otherNCA / g,
      payables: prev.payables / g,
      shortDebt: prev.shortDebt / (1 + (growthBack[i] - 3) / 100),
      otherCL: prev.otherCL / g,
      longDebt: prev.longDebt / (1 + (growthBack[i] - 2) / 100),
      otherNCL: prev.otherNCL / g,
      equity: prev.equity / (1 + (growthBack[i] + 2) / 100),
      capex: prev.capex / g,
      dividends: prev.dividends / g,
      shares: prev.shares,
    };
    rows.unshift({ year: years[3 - i], ...r });
    prev = r;
  }
  return rows;
}

export const COMPANIES: Company[] = [
  {
    ticker: "TCS", bse: "532540", name: "Tata Consultancy Services",
    sector: "Information Technology", industry: "IT Services",
    description: "India's largest IT services firm and a global leader in digital transformation, cloud, and consulting services across BFSI, retail, life sciences and communications verticals.",
    cmp: 4115, beta: 0.72, taxRate: 0.255, costOfDebt: 0.075, riskFreeRate: 0.072, marketRiskPremium: 0.065,
    peers: ["INFY", "HCLT", "WIPRO"],
    history: build({
      revenue: 240893, cogs: 138900, opex: 36500, da: 4942, interest: 838, otherIncome: 4757, tax: 13205,
      cash: 12455, receivables: 49000, inventory: 12, otherCA: 18500, ppe: 9400, otherNCA: 22000,
      payables: 9800, shortDebt: 0, otherCL: 32000, longDebt: 8200, otherNCL: 4000, equity: 91500,
      capex: 3290, dividends: 27000, shares: 362,
    }, [8, 17, 16, 7, 5]),
  },
  {
    ticker: "RELIANCE", bse: "500325", name: "Reliance Industries",
    sector: "Energy / Conglomerate", industry: "Oil-to-Telecom",
    description: "India's largest private conglomerate spanning oil-to-chemicals (O2C), Jio digital services, Reliance Retail, and new energy/green hydrogen.",
    cmp: 2935, beta: 1.05, taxRate: 0.255, costOfDebt: 0.082, riskFreeRate: 0.072, marketRiskPremium: 0.065,
    peers: ["ONGC", "BPCL", "IOC"],
    history: build({
      revenue: 901064, cogs: 620000, opex: 110000, da: 50832, interest: 23118, otherIncome: 12500, tax: 18560,
      cash: 95000, receivables: 39000, inventory: 130000, otherCA: 80000, ppe: 650000, otherNCA: 280000,
      payables: 165000, shortDebt: 130000, otherCL: 150000, longDebt: 240000, otherNCL: 95000, equity: 794000,
      capex: 130000, dividends: 6770, shares: 677,
    }, [3, 24, 47, 0, 2]),
  },
  {
    ticker: "INFY", bse: "500209", name: "Infosys",
    sector: "Information Technology", industry: "IT Services",
    description: "Global digital services and consulting leader providing AI-first business transformation, cloud and enterprise software services.",
    cmp: 1855, beta: 0.78, taxRate: 0.262, costOfDebt: 0.075, riskFreeRate: 0.072, marketRiskPremium: 0.065,
    peers: ["TCS", "HCLT", "WIPRO"],
    history: build({
      revenue: 153670, cogs: 95800, opex: 22500, da: 4678, interest: 470, otherIncome: 3140, tax: 9740,
      cash: 14786, receivables: 32800, inventory: 0, otherCA: 12500, ppe: 7800, otherNCA: 19500,
      payables: 5400, shortDebt: 0, otherCL: 24000, longDebt: 2500, otherNCL: 3500, equity: 76200,
      capex: 2200, dividends: 16370, shares: 414,
    }, [10, 21, 20, 4, 5]),
  },
  {
    ticker: "HDFCBANK", bse: "500180", name: "HDFC Bank",
    sector: "Financials", industry: "Private Sector Bank",
    description: "India's largest private bank by assets following the HDFC Ltd merger; market leader in retail banking, cards and digital payments.",
    cmp: 1685, beta: 0.95, taxRate: 0.255, costOfDebt: 0.065, riskFreeRate: 0.072, marketRiskPremium: 0.065,
    peers: ["ICICIBANK", "AXISBANK", "KOTAKBANK"],
    history: build({
      revenue: 407995, cogs: 232500, opex: 64000, da: 4500, interest: 0, otherIncome: 49200, tax: 18900,
      cash: 178000, receivables: 2480000, inventory: 0, otherCA: 60000, ppe: 12500, otherNCA: 320000,
      payables: 145000, shortDebt: 660000, otherCL: 220000, longDebt: 1290000, otherNCL: 110000, equity: 437000,
      capex: 4200, dividends: 14700, shares: 760,
    }, [16, 20, 19, 21, 6]),
  },
  {
    ticker: "TATASTEEL", bse: "500470", name: "Tata Steel",
    sector: "Materials", industry: "Iron & Steel",
    description: "One of the world's most geographically diversified steel producers with major operations in India, the UK and the Netherlands.",
    cmp: 152, beta: 1.35, taxRate: 0.255, costOfDebt: 0.088, riskFreeRate: 0.072, marketRiskPremium: 0.065,
    peers: ["JSWSTEEL", "SAIL", "JINDALSTEL"],
    history: build({
      revenue: 229171, cogs: 175000, opex: 27000, da: 9805, interest: 6597, otherIncome: 2100, tax: -1932,
      cash: 7780, receivables: 14500, inventory: 38500, otherCA: 22000, ppe: 138000, otherNCA: 78000,
      payables: 38500, shortDebt: 26000, otherCL: 32000, longDebt: 51000, otherNCL: 45000, equity: 106000,
      capex: 15700, dividends: 4495, shares: 1248,
    }, [5, 28, 53, -8, -2]),
  },
  {
    ticker: "ICICIBANK", bse: "532174", name: "ICICI Bank",
    sector: "Financials", industry: "Private Sector Bank",
    description: "Leading Indian private sector bank with strong franchises in corporate, retail, and digital banking.",
    cmp: 1245, beta: 0.97, taxRate: 0.255, costOfDebt: 0.065, riskFreeRate: 0.072, marketRiskPremium: 0.065,
    peers: ["HDFCBANK", "AXISBANK", "KOTAKBANK"],
    history: build({
      revenue: 236037, cogs: 110000, opex: 50000, da: 2400, interest: 0, otherIncome: 33500, tax: 13580,
      cash: 117000, receivables: 1184000, inventory: 0, otherCA: 38000, ppe: 11000, otherNCA: 130000,
      payables: 85000, shortDebt: 245000, otherCL: 145000, longDebt: 410000, otherNCL: 80000, equity: 252000,
      capex: 3500, dividends: 7000, shares: 700,
    }, [12, 18, 22, 22, 8]),
  },
  {
    ticker: "ITC", bse: "500875", name: "ITC",
    sector: "Consumer Staples", industry: "Diversified FMCG",
    description: "Diversified FMCG, hotels, paperboards, agri-business and packaging conglomerate; market leader in Indian cigarettes.",
    cmp: 440, beta: 0.55, taxRate: 0.255, costOfDebt: 0.078, riskFreeRate: 0.072, marketRiskPremium: 0.065,
    peers: ["HINDUNILVR", "NESTLEIND", "VBL"],
    history: build({
      revenue: 70251, cogs: 35000, opex: 9500, da: 1925, interest: 56, otherIncome: 3010, tax: 7180,
      cash: 8200, receivables: 3000, inventory: 12500, otherCA: 14000, ppe: 26500, otherNCA: 18500,
      payables: 8500, shortDebt: 200, otherCL: 12000, longDebt: 50, otherNCL: 1500, equity: 70500,
      capex: 3000, dividends: 16400, shares: 1247,
    }, [3, 9, 24, 8, 2]),
  },
  {
    ticker: "HINDUNILVR", bse: "500696", name: "Hindustan Unilever",
    sector: "Consumer Staples", industry: "Personal & Home Care",
    description: "India's largest FMCG company; brands span home care, beauty & personal care, foods & refreshments.",
    cmp: 2410, beta: 0.5, taxRate: 0.258, costOfDebt: 0.078, riskFreeRate: 0.072, marketRiskPremium: 0.065,
    peers: ["ITC", "NESTLEIND", "DABUR"],
    history: build({
      revenue: 60580, cogs: 30000, opex: 14000, da: 1175, interest: 200, otherIncome: 600, tax: 3500,
      cash: 6000, receivables: 1850, inventory: 4200, otherCA: 3500, ppe: 6500, otherNCA: 38000,
      payables: 10500, shortDebt: 0, otherCL: 9500, longDebt: 0, otherNCL: 2500, equity: 49000,
      capex: 1100, dividends: 9500, shares: 235,
    }, [2, 11, 17, 6, 3]),
  },
  {
    ticker: "BHARTIARTL", bse: "532454", name: "Bharti Airtel",
    sector: "Communication Services", industry: "Telecom",
    description: "Second-largest Indian wireless operator with significant Africa exposure; leader in 5G rollout and home broadband.",
    cmp: 1265, beta: 0.85, taxRate: 0.255, costOfDebt: 0.085, riskFreeRate: 0.072, marketRiskPremium: 0.065,
    peers: ["RELIANCE", "VODAFONEIDEA", "IDEA"],
    history: build({
      revenue: 149982, cogs: 35000, opex: 47500, da: 35700, interest: 22500, otherIncome: 1800, tax: 4500,
      cash: 11500, receivables: 7500, inventory: 850, otherCA: 18000, ppe: 195000, otherNCA: 110000,
      payables: 38000, shortDebt: 22000, otherCL: 80000, longDebt: 168000, otherNCL: 40000, equity: 90000,
      capex: 38000, dividends: 4500, shares: 597,
    }, [16, 19, 20, 8, 7]),
  },
  {
    ticker: "LT", bse: "500510", name: "Larsen & Toubro",
    sector: "Industrials", industry: "Construction & Engineering",
    description: "India's largest engineering, construction, infrastructure and defence conglomerate with a growing IT services portfolio.",
    cmp: 3540, beta: 1.15, taxRate: 0.255, costOfDebt: 0.082, riskFreeRate: 0.072, marketRiskPremium: 0.065,
    peers: ["SIEMENS", "ABB", "BHEL"],
    history: build({
      revenue: 221113, cogs: 158000, opex: 35000, da: 4300, interest: 3800, otherIncome: 3200, tax: 4700,
      cash: 12500, receivables: 47000, inventory: 7800, otherCA: 110000, ppe: 22000, otherNCA: 180000,
      payables: 78000, shortDebt: 30000, otherCL: 95000, longDebt: 105000, otherNCL: 40000, equity: 89000,
      capex: 4200, dividends: 4000, shares: 137,
    }, [4, 17, 22, 7, 4]),
  },
];

export const findCompany = (q: string): Company | undefined => {
  const s = q.trim().toUpperCase();
  return COMPANIES.find(
    (c) => c.ticker === s || c.bse === s || c.name.toUpperCase().includes(s),
  );
};

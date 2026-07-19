import ExcelJS from "exceljs";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import PptxGenJS from "pptxgenjs";
import type { Company } from "@shared/data/companies";
import {
  buildIncome,
  buildBalance,
  buildCashFlow,
  buildRatios,
  type Forecast,
  type ForecastRow,
  type DCFResult,
  relativeValuation,
  defaultDCFInputs,
  scenarios,
  runDCF,
  projectForecast,
} from "@shared/lib/financials";

// ---------- Style helpers (Investment-banking convention) ----------
// Blue = hardcoded historical inputs, Black = formulas, Green = forecast assumptions
const COLOR = {
  inputBlue: { argb: "FF0033A0" },
  formulaBlack: { argb: "FF000000" },
  forecastGreen: { argb: "FF006100" },
  headerFill: { argb: "FF1F3864" },
  headerText: { argb: "FFFFFFFF" },
  bandFill: { argb: "FFEDEFF5" },
  subtotalFill: { argb: "FFD9E1F2" },
  totalFill: { argb: "FFBDD7EE" },
  border: { argb: "FFB4B4B4" },
};

const FONT_BASE = { name: "Calibri", size: 10 };
const FONT_HEADER = {
  name: "Calibri",
  size: 11,
  bold: true,
  color: COLOR.headerText,
};
const FONT_TITLE = {
  name: "Calibri",
  size: 16,
  bold: true,
  color: { argb: "FF1F3864" },
};
const FONT_INPUT = { ...FONT_BASE, color: COLOR.inputBlue };
const FONT_FORMULA = { ...FONT_BASE, color: COLOR.formulaBlack };
const FONT_FORECAST = { ...FONT_BASE, color: COLOR.forecastGreen };
const FONT_BOLD = { ...FONT_BASE, bold: true };

const NUM_FMT = '#,##0;(#,##0);"-"';
const NUM_FMT_DEC = '#,##0.00;(#,##0.00);"-"';
const PCT_FMT = '0.0%;(0.0%);"-"';
const MULT_FMT = '0.0"x"';
const RS_FMT = '"₹"#,##0;("₹"#,##0);"-"';

function styleHeaderRow(ws: ExcelJS.Worksheet, rowIdx: number) {
  const row = ws.getRow(rowIdx);
  row.eachCell((cell) => {
    cell.font = FONT_HEADER;
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: COLOR.headerFill,
    };
    cell.alignment = { vertical: "middle", horizontal: "center" };
    cell.border = {
      top: { style: "thin", color: COLOR.border },
      bottom: { style: "thin", color: COLOR.border },
      left: { style: "thin", color: COLOR.border },
      right: { style: "thin", color: COLOR.border },
    };
  });
  row.height = 22;
}

function autoSize(ws: ExcelJS.Worksheet, minLabel = 32) {
  ws.columns.forEach((col, i) => {
    let max = i === 0 ? minLabel : 12;
    col.eachCell?.({ includeEmpty: false }, (cell) => {
      const v = cell.value;
      const s =
        v == null
          ? ""
          : typeof v === "object" && "formula" in (v as object)
            ? String((v as { result?: unknown }).result ?? "")
            : String(v);
      if (s.length > max) max = Math.min(s.length + 2, 40);
    });
    col.width = max;
  });
}

function colLetter(n: number) {
  // 1 -> A, 2 -> B, ... 27 -> AA
  let s = "";
  while (n > 0) {
    const m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

function writeSectionBand(
  ws: ExcelJS.Worksheet,
  rowIdx: number,
  label: string,
  span: number,
) {
  const row = ws.getRow(rowIdx);
  row.getCell(1).value = label;
  row.getCell(1).font = { ...FONT_BOLD, color: { argb: "FF1F3864" } };
  for (let c = 1; c <= span; c++) {
    row.getCell(c).fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: COLOR.bandFill,
    };
  }
  row.height = 18;
}

export async function exportExcelModel(
  c: Company,
  forecast: ForecastRow[],
  dcf: DCFResult,
  f: Forecast,
) {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Lovable Financial Modeler";
  wb.created = new Date();
  wb.properties.date1904 = false;

  const inc = buildIncome(c.history, c.history[c.history.length - 1].shares);
  const bal = buildBalance(c.history);
  const cf = buildCashFlow(c.history, inc);
  const ratios = buildRatios(inc, bal, c.history);
  const rel = relativeValuation(c);
  const histYears = inc.map((r) => r.year);
  const fcYears = forecast.map((r) => r.year);
  const today = new Date().toISOString().slice(0, 10);
  const lastHist = inc[inc.length - 1];
  const lastBal = bal[bal.length - 1];
  const lastRow = c.history[c.history.length - 1];
  const sharesCr = lastRow.shares;
  const mktCap = c.cmp * sharesCr;

  // ---------- generic helpers ----------
  const setTitle = (
    ws: ExcelJS.Worksheet,
    title: string,
    sub?: string,
    span = 7,
  ) => {
    ws.getCell("A1").value = title;
    ws.getCell("A1").font = FONT_TITLE;
    ws.mergeCells(1, 1, 1, span);
    ws.getRow(1).height = 26;
    if (sub) {
      ws.getCell("A2").value = sub;
      ws.getCell("A2").font = {
        ...FONT_BASE,
        italic: true,
        color: { argb: "FF6B6B6B" },
      };
      ws.mergeCells(2, 1, 2, span);
    }
  };

  type RowDef = {
    label: string;
    vals: (number | string | null)[];
    fmt?: string;
    bold?: boolean;
    subtotal?: boolean;
    total?: boolean;
    font?: Partial<ExcelJS.Font>;
  };
  const writeTable = (
    ws: ExcelJS.Worksheet,
    startRow: number,
    headers: string[],
    rows: RowDef[],
  ) => {
    const hdr = ws.getRow(startRow);
    headers.forEach((h, i) => {
      hdr.getCell(1 + i).value = h;
    });
    styleHeaderRow(ws, startRow);
    rows.forEach((rd, ri) => {
      const r = ws.getRow(startRow + 1 + ri);
      r.getCell(1).value = rd.label;
      if (rd.bold || rd.subtotal || rd.total) r.getCell(1).font = FONT_BOLD;
      rd.vals.forEach((v, ci) => {
        const cell = r.getCell(2 + ci);
        cell.value = typeof v === "number" && !isFinite(v) ? 0 : v;
        if (rd.fmt && typeof v === "number") cell.numFmt = rd.fmt;
        cell.font =
          rd.subtotal || rd.total || rd.bold
            ? FONT_BOLD
            : (rd.font ?? FONT_INPUT);
        if (rd.subtotal)
          cell.fill = {
            type: "pattern",
            pattern: "solid",
            fgColor: COLOR.subtotalFill,
          };
        if (rd.total) {
          cell.fill = {
            type: "pattern",
            pattern: "solid",
            fgColor: COLOR.totalFill,
          };
          cell.border = {
            top: { style: "thin", color: COLOR.border },
            bottom: { style: "double", color: COLOR.border },
          };
        }
      });
    });
    return startRow + rows.length + 1;
  };

  const sectionBand = (
    ws: ExcelJS.Worksheet,
    r: number,
    label: string,
    span: number,
  ) => {
    writeSectionBand(ws, r, label, span);
    return r + 1;
  };

  // =================================================================
  // SHEET 1 — COVER
  // =================================================================
  {
    const ws = wb.addWorksheet("Cover", {
      properties: { tabColor: { argb: "FF1F3864" } },
    });
    ws.mergeCells("A1:F1");
    ws.getCell("A1").value = `${c.name.toUpperCase()}`;
    ws.getCell("A1").font = { ...FONT_TITLE, size: 26 };
    ws.getRow(1).height = 38;

    ws.mergeCells("A2:F2");
    ws.getCell("A2").value =
      `BSE: ${c.bse ?? "—"}  |  NSE: ${c.ticker}  |  Sector: ${c.sector}`;
    ws.getCell("A2").font = {
      ...FONT_BASE,
      italic: true,
      size: 11,
      color: { argb: "FF6B6B6B" },
    };

    ws.mergeCells("A4:F6");
    ws.getCell("A4").value = "FINANCIAL MODELLING & VALUATION REPORT";
    ws.getCell("A4").font = {
      ...FONT_TITLE,
      size: 36,
      color: { argb: "FF1F3864" },
    };
    ws.getCell("A4").alignment = { horizontal: "center", vertical: "middle" };
    ws.getRow(5).height = 28;

    ws.mergeCells("A7:F7");
    ws.getCell("A7").value =
      `Prepared: ${today}  •  Generated by Lovable Financial Modeler`;
    ws.getCell("A7").font = { ...FONT_BASE, italic: true };
    ws.getCell("A7").alignment = { horizontal: "center" };

    // Table of Contents
    ws.getCell("A10").value = "TABLE OF CONTENTS";
    ws.getCell("A10").font = {
      ...FONT_BOLD,
      size: 14,
      color: { argb: "FF1F3864" },
    };
    const toc = [
      ["1", "Company Profile & Snapshot"],
      ["2", "Income Statement (FY history)"],
      ["3", "Balance Sheet (FY history)"],
      ["4", "Working Capital Analysis"],
      ["5", "Cash Flow Statement"],
      ["6", "Ratio Analysis"],
      ["7", "Free Cash Flow to Firm (FCFF) & WACC"],
      ["8", "DCF Valuation"],
      ["9", "Price Valuation Summary"],
    ];
    ws.getRow(12).values = ["No.", "Section"];
    styleHeaderRow(ws, 12);
    toc.forEach(([n, s], i) => {
      const r = ws.getRow(13 + i);
      r.getCell(1).value = n;
      r.getCell(2).value = s;
    });

    ws.getCell("A23").value = "COLOR LEGEND";
    ws.getCell("A23").font = {
      ...FONT_BOLD,
      size: 12,
      color: { argb: "FF1F3864" },
    };
    ws.getCell("A24").value = "Blue = hardcoded input";
    ws.getCell("A24").font = FONT_INPUT;
    ws.getCell("A25").value = "Black = formula / calculation";
    ws.getCell("A25").font = FONT_FORMULA;
    ws.getCell("A26").value = "Green = forecast assumption";
    ws.getCell("A26").font = FONT_FORECAST;

    ws.getCell("A28").value = "DISCLAIMER";
    ws.getCell("A28").font = { ...FONT_BOLD, color: { argb: "FFC00000" } };
    ws.mergeCells("A29:F32");
    ws.getCell("A29").value =
      "This report is generated for educational/analytical purposes only and does not constitute investment advice. Historical figures may be synthesized for prototype use. Verify data against official BSE/NSE filings and the company's annual report before any investment decision.";
    ws.getCell("A29").alignment = { wrapText: true, vertical: "top" };
    ws.getCell("A29").font = { ...FONT_BASE, italic: true };

    ws.columns = [
      { width: 8 },
      { width: 42 },
      { width: 14 },
      { width: 14 },
      { width: 14 },
      { width: 14 },
    ];
  }

  // =================================================================
  // SHEET 2 — COMPANY PROFILE
  // =================================================================
  {
    const ws = wb.addWorksheet("Company Profile", {
      properties: { tabColor: { argb: "FF305496" } },
    });
    setTitle(
      ws,
      "1. ONE PAGE COMPANY PROFILE",
      `${c.name}  |  NSE: ${c.ticker}  |  BSE: ${c.bse ?? "—"}`,
      7,
    );

    ws.getCell("A4").value = "About the Company";
    ws.getCell("A4").font = {
      ...FONT_BOLD,
      size: 12,
      color: { argb: "FF1F3864" },
    };
    ws.mergeCells("A5:G7");
    ws.getCell("A5").value = c.description;
    ws.getCell("A5").alignment = { wrapText: true, vertical: "top" };
    ws.getCell("A5").font = FONT_BASE;

    let r = 9;
    r = sectionBand(
      ws,
      r,
      "KEY FINANCIAL METRICS (₹ Cr)",
      histYears.length + 1,
    );
    r = writeTable(
      ws,
      r,
      ["Particular", ...histYears],
      [
        {
          label: "Revenue from Operations",
          vals: inc.map((x) => x.revenue),
          fmt: NUM_FMT,
          bold: true,
        },
        {
          label: "YoY Growth %",
          vals: inc.map((x, i) =>
            i === 0
              ? "—"
              : (x.revenue - inc[i - 1].revenue) / inc[i - 1].revenue,
          ),
          fmt: PCT_FMT,
        },
        {
          label: "Gross Profit",
          vals: inc.map((x) => x.grossProfit),
          fmt: NUM_FMT,
        },
        {
          label: "Gross Margin %",
          vals: inc.map((x) => x.grossProfit / x.revenue),
          fmt: PCT_FMT,
        },
        {
          label: "EBITDA",
          vals: inc.map((x) => x.ebitda),
          fmt: NUM_FMT,
          subtotal: true,
        },
        {
          label: "EBITDA Margin %",
          vals: inc.map((x) => x.ebitda / x.revenue),
          fmt: PCT_FMT,
        },
        {
          label: "PAT (Net Profit)",
          vals: inc.map((x) => x.pat),
          fmt: NUM_FMT,
          total: true,
        },
        {
          label: "Net Profit Margin %",
          vals: inc.map((x) => x.pat / x.revenue),
          fmt: PCT_FMT,
        },
        { label: "EPS (₹)", vals: inc.map((x) => x.eps), fmt: NUM_FMT_DEC },
      ],
    );

    r = sectionBand(
      ws,
      r + 1,
      "BALANCE SHEET HIGHLIGHTS (₹ Cr)",
      histYears.length + 1,
    );
    r = writeTable(
      ws,
      r,
      ["Particular", ...histYears],
      [
        {
          label: "Total Assets",
          vals: bal.map((x) => x.totalAssets),
          fmt: NUM_FMT,
          bold: true,
        },
        { label: "Total Equity", vals: bal.map((x) => x.equity), fmt: NUM_FMT },
        {
          label: "Total Debt",
          vals: c.history.map((x) => x.longDebt + x.shortDebt),
          fmt: NUM_FMT,
        },
        {
          label: "Net Debt / (Cash)",
          vals: c.history.map((x) => x.longDebt + x.shortDebt - x.cash),
          fmt: NUM_FMT,
        },
      ],
    );

    r = sectionBand(
      ws,
      r + 1,
      "VALUATION & RETURN METRICS",
      histYears.length + 1,
    );
    r = writeTable(
      ws,
      r,
      ["Particular", ...histYears],
      [
        { label: "ROE %", vals: ratios.map((x) => x.roe), fmt: PCT_FMT },
        { label: "ROCE %", vals: ratios.map((x) => x.roce), fmt: PCT_FMT },
        {
          label: "Debt / Equity (x)",
          vals: ratios.map((x) => x.debtEquity),
          fmt: NUM_FMT_DEC,
        },
      ],
    );

    // Snapshot box
    r += 2;
    ws.getCell(`A${r}`).value = "VALUATION SNAPSHOT (CURRENT)";
    ws.getCell(`A${r}`).font = {
      ...FONT_BOLD,
      size: 12,
      color: { argb: "FF1F3864" },
    };
    r += 1;
    const snap: [string, string | number, string][] = [
      ["WACC", dcf.wacc, PCT_FMT],
      ["Terminal Growth", 0.04, PCT_FMT],
      ["Intrinsic Value (₹)", dcf.intrinsicPrice, RS_FMT],
      ["CMP (₹)", c.cmp, RS_FMT],
      ["Upside / (Downside)", dcf.upside, PCT_FMT],
      ["Market Cap (₹ Cr)", mktCap, NUM_FMT],
    ];
    snap.forEach((s, i) => {
      const row = ws.getRow(r + i);
      row.getCell(1).value = s[0];
      row.getCell(1).font = FONT_BOLD;
      row.getCell(2).value = s[1];
      row.getCell(2).numFmt = s[2];
      row.getCell(2).font = { ...FONT_BOLD, color: { argb: "FFC00000" } };
    });

    ws.columns = [
      { width: 38 },
      ...histYears.map(() => ({ width: 14 })),
      { width: 12 },
    ];
    ws.views = [{ state: "frozen", xSplit: 1, ySplit: 3 }];
  }

  // =================================================================
  // SHEET 3 — INCOME STATEMENT
  // =================================================================
  {
    const ws = wb.addWorksheet("Income Statement", {
      properties: { tabColor: { argb: "FF2E75B6" } },
    });
    setTitle(
      ws,
      "2. INCOME STATEMENT",
      "Consolidated — All figures in ₹ Crores",
      histYears.length + 1,
    );
    let r = 4;
    r = sectionBand(ws, r, "REVENUE", histYears.length + 1);
    const hdr = ws.getRow(r);
    hdr.getCell(1).value = "Particular (₹ Cr)";
    histYears.forEach((y, i) => (hdr.getCell(2 + i).value = y));
    styleHeaderRow(ws, r);
    r++;
    const blocks: RowDef[] = [
      {
        label: "Revenue from Operations",
        vals: inc.map((x) => x.revenue),
        fmt: NUM_FMT,
        bold: true,
      },
      {
        label: "YoY Growth %",
        vals: inc.map((x, i) =>
          i === 0 ? "—" : (x.revenue - inc[i - 1].revenue) / inc[i - 1].revenue,
        ),
        fmt: PCT_FMT,
        font: FONT_FORMULA,
      },
      {
        label: "Other Income",
        vals: inc.map((x) => x.otherIncome),
        fmt: NUM_FMT,
      },
      {
        label: "TOTAL REVENUE",
        vals: inc.map((x) => x.revenue + x.otherIncome),
        fmt: NUM_FMT,
        subtotal: true,
      },
    ];
    blocks.forEach((rd, ri) => {
      const row = ws.getRow(r + ri);
      row.getCell(1).value = rd.label;
      if (rd.bold || rd.subtotal) row.getCell(1).font = FONT_BOLD;
      rd.vals.forEach((v, ci) => {
        const cell = row.getCell(2 + ci);
        cell.value = v as ExcelJS.CellValue;
        if (rd.fmt && typeof v === "number") cell.numFmt = rd.fmt;
        cell.font = rd.subtotal ? FONT_BOLD : (rd.font ?? FONT_INPUT);
        if (rd.subtotal)
          cell.fill = {
            type: "pattern",
            pattern: "solid",
            fgColor: COLOR.subtotalFill,
          };
      });
    });
    r += blocks.length + 1;

    r = sectionBand(ws, r, "COST OF GOODS SOLD (COGS)", histYears.length + 1);
    r = writeTable(
      ws,
      r,
      ["Particular", ...histYears],
      [
        {
          label: "Cost of Materials / COGS",
          vals: inc.map((x) => x.cogs),
          fmt: NUM_FMT,
        },
        {
          label: "TOTAL COGS",
          vals: inc.map((x) => x.cogs),
          fmt: NUM_FMT,
          subtotal: true,
        },
        {
          label: "GROSS PROFIT",
          vals: inc.map((x) => x.grossProfit),
          fmt: NUM_FMT,
          total: true,
        },
        {
          label: "Gross Profit Margin %",
          vals: inc.map((x) => x.grossProfit / x.revenue),
          fmt: PCT_FMT,
          font: FONT_FORMULA,
        },
      ],
    );

    r = sectionBand(ws, r + 1, "OPERATING EXPENSES", histYears.length + 1);
    r = writeTable(
      ws,
      r,
      ["Particular", ...histYears],
      [
        {
          label: "Employee Benefits",
          vals: inc.map((x) => x.opex * 0.38),
          fmt: NUM_FMT,
        },
        {
          label: "Advertisement & Publicity",
          vals: inc.map((x) => x.opex * 0.22),
          fmt: NUM_FMT,
        },
        {
          label: "Other Operating Expenses",
          vals: inc.map((x) => x.opex * 0.4),
          fmt: NUM_FMT,
        },
        {
          label: "Total Operating Expenses",
          vals: inc.map((x) => x.opex),
          fmt: NUM_FMT,
          subtotal: true,
        },
        {
          label: "EBITDA",
          vals: inc.map((x) => x.ebitda),
          fmt: NUM_FMT,
          total: true,
        },
        {
          label: "EBITDA Margin %",
          vals: inc.map((x) => x.ebitda / x.revenue),
          fmt: PCT_FMT,
          font: FONT_FORMULA,
        },
        {
          label: "Depreciation & Amortization",
          vals: inc.map((x) => x.da),
          fmt: NUM_FMT,
        },
        {
          label: "EBIT (Operating Profit)",
          vals: inc.map((x) => x.ebit),
          fmt: NUM_FMT,
          subtotal: true,
        },
        {
          label: "Finance Costs",
          vals: inc.map((x) => x.interest),
          fmt: NUM_FMT,
        },
        {
          label: "Profit Before Tax (PBT)",
          vals: inc.map((x) => x.pbt),
          fmt: NUM_FMT,
          subtotal: true,
        },
        { label: "Tax Expense", vals: inc.map((x) => x.tax), fmt: NUM_FMT },
        {
          label: "PROFIT AFTER TAX (PAT)",
          vals: inc.map((x) => x.pat),
          fmt: NUM_FMT,
          total: true,
        },
        {
          label: "Net Profit Margin %",
          vals: inc.map((x) => x.pat / x.revenue),
          fmt: PCT_FMT,
          font: FONT_FORMULA,
        },
        {
          label: "Effective Tax Rate %",
          vals: inc.map((x) => (x.pbt > 0 ? x.tax / x.pbt : 0)),
          fmt: PCT_FMT,
          font: FONT_FORMULA,
        },
        {
          label: "EPS (₹)",
          vals: inc.map((x) => x.eps),
          fmt: NUM_FMT_DEC,
          font: FONT_FORMULA,
        },
      ],
    );

    ws.columns = [{ width: 40 }, ...histYears.map(() => ({ width: 13 }))];
    ws.views = [{ state: "frozen", xSplit: 1, ySplit: 4 }];
  }

  // =================================================================
  // SHEET 4 — BALANCE SHEET
  // =================================================================
  {
    const ws = wb.addWorksheet("Balance Sheet", {
      properties: { tabColor: { argb: "FF2E75B6" } },
    });
    setTitle(
      ws,
      "3. BALANCE SHEET",
      "Consolidated — All figures in ₹ Crores",
      histYears.length + 1,
    );
    let r = 4;
    r = sectionBand(ws, r, "EQUITY & LIABILITIES", histYears.length + 1);
    r = writeTable(
      ws,
      r,
      ["Particular", ...histYears],
      [
        {
          label: "A. SHAREHOLDERS' EQUITY",
          vals: histYears.map(() => ""),
          bold: true,
        },
        {
          label: "Share Capital",
          vals: c.history.map((x) => x.equity * 0.02),
          fmt: NUM_FMT,
        },
        {
          label: "Reserves & Surplus",
          vals: c.history.map((x) => x.equity * 0.98),
          fmt: NUM_FMT,
        },
        {
          label: "TOTAL EQUITY",
          vals: c.history.map((x) => x.equity),
          fmt: NUM_FMT,
          subtotal: true,
        },
        {
          label: "B. NON-CURRENT LIABILITIES",
          vals: histYears.map(() => ""),
          bold: true,
        },
        {
          label: "Long-Term Borrowings",
          vals: c.history.map((x) => x.longDebt),
          fmt: NUM_FMT,
        },
        {
          label: "Other Non-Current Liabilities",
          vals: c.history.map((x) => x.otherNCL),
          fmt: NUM_FMT,
        },
        {
          label: "TOTAL NON-CURRENT LIAB.",
          vals: bal.map((x) => x.nonCurrentLiabilities),
          fmt: NUM_FMT,
          subtotal: true,
        },
        {
          label: "C. CURRENT LIABILITIES",
          vals: histYears.map(() => ""),
          bold: true,
        },
        {
          label: "Short-Term Borrowings",
          vals: c.history.map((x) => x.shortDebt),
          fmt: NUM_FMT,
        },
        {
          label: "Trade Payables",
          vals: c.history.map((x) => x.payables),
          fmt: NUM_FMT,
        },
        {
          label: "Other Current Liabilities",
          vals: c.history.map((x) => x.otherCL),
          fmt: NUM_FMT,
        },
        {
          label: "TOTAL CURRENT LIAB.",
          vals: bal.map((x) => x.currentLiabilities),
          fmt: NUM_FMT,
          subtotal: true,
        },
        {
          label: "TOTAL EQUITY & LIABILITIES",
          vals: bal.map((x) => x.totalLiabEquity),
          fmt: NUM_FMT,
          total: true,
        },
      ],
    );

    r = sectionBand(ws, r + 1, "ASSETS", histYears.length + 1);
    r = writeTable(
      ws,
      r,
      ["Particular", ...histYears],
      [
        {
          label: "D. NON-CURRENT ASSETS",
          vals: histYears.map(() => ""),
          bold: true,
        },
        {
          label: "Property, Plant & Equipment",
          vals: c.history.map((x) => x.ppe),
          fmt: NUM_FMT,
        },
        {
          label: "Other Non-Current Assets",
          vals: c.history.map((x) => x.otherNCA),
          fmt: NUM_FMT,
        },
        {
          label: "TOTAL NON-CURRENT ASSETS",
          vals: bal.map((x) => x.nonCurrentAssets),
          fmt: NUM_FMT,
          subtotal: true,
        },
        {
          label: "E. CURRENT ASSETS",
          vals: histYears.map(() => ""),
          bold: true,
        },
        {
          label: "Inventories",
          vals: c.history.map((x) => x.inventory),
          fmt: NUM_FMT,
        },
        {
          label: "Trade Receivables",
          vals: c.history.map((x) => x.receivables),
          fmt: NUM_FMT,
        },
        {
          label: "Cash & Cash Equivalents",
          vals: c.history.map((x) => x.cash),
          fmt: NUM_FMT,
        },
        {
          label: "Other Current Assets",
          vals: c.history.map((x) => x.otherCA),
          fmt: NUM_FMT,
        },
        {
          label: "TOTAL CURRENT ASSETS",
          vals: bal.map((x) => x.currentAssets),
          fmt: NUM_FMT,
          subtotal: true,
        },
        {
          label: "TOTAL ASSETS",
          vals: bal.map((x) => x.totalAssets),
          fmt: NUM_FMT,
          total: true,
        },
        {
          label: "Balance Check (A − L−E)",
          vals: bal.map((x) => Math.round(x.check)),
          fmt: NUM_FMT,
          font: FONT_FORMULA,
        },
      ],
    );

    ws.columns = [{ width: 40 }, ...histYears.map(() => ({ width: 13 }))];
    ws.views = [{ state: "frozen", xSplit: 1, ySplit: 4 }];
  }

  // =================================================================
  // SHEET 5 — WORKING CAPITAL ANALYSIS
  // =================================================================
  {
    const ws = wb.addWorksheet("Working Capital", {
      properties: { tabColor: { argb: "FF5B9BD5" } },
    });
    setTitle(
      ws,
      "4. WORKING CAPITAL ANALYSIS",
      "Short-term operational efficiency — ₹ Crores",
      histYears.length + 1,
    );

    const recv = c.history.map((x) => x.receivables);
    const inv = c.history.map((x) => x.inventory);
    const pay = c.history.map((x) => x.payables);
    const nwc = c.history.map((x) => x.receivables + x.inventory - x.payables);
    const wcChange = nwc.map((v, i) => (i === 0 ? "—" : v - nwc[i - 1]));

    let r = 4;
    r = sectionBand(
      ws,
      r,
      "4.1 HISTORICAL WORKING CAPITAL COMPONENTS",
      histYears.length + 1,
    );
    r = writeTable(
      ws,
      r,
      ["Particular", ...histYears],
      [
        { label: "Trade Receivables", vals: recv, fmt: NUM_FMT },
        { label: "Inventories", vals: inv, fmt: NUM_FMT },
        { label: "Trade Payables", vals: pay, fmt: NUM_FMT },
        { label: "NET WORKING CAPITAL", vals: nwc, fmt: NUM_FMT, total: true },
        {
          label: "Change in NWC",
          vals: wcChange,
          fmt: NUM_FMT,
          font: FONT_FORMULA,
        },
      ],
    );

    r = sectionBand(
      ws,
      r + 1,
      "WORKING CAPITAL % OF REVENUE",
      histYears.length + 1,
    );
    r = writeTable(
      ws,
      r,
      ["Particular", ...histYears],
      [
        {
          label: "Receivables % of Revenue",
          vals: recv.map((v, i) => v / inc[i].revenue),
          fmt: PCT_FMT,
          font: FONT_FORMULA,
        },
        {
          label: "Inventory % of Revenue",
          vals: inv.map((v, i) => v / inc[i].revenue),
          fmt: PCT_FMT,
          font: FONT_FORMULA,
        },
        {
          label: "Payables % of Revenue",
          vals: pay.map((v, i) => v / inc[i].revenue),
          fmt: PCT_FMT,
          font: FONT_FORMULA,
        },
      ],
    );

    r = sectionBand(ws, r + 1, "DAYS ANALYSIS", histYears.length + 1);
    const recvDays = recv.map((v, i) => (v / inc[i].revenue) * 365);
    const invDays = inv.map((v, i) => (v / Math.max(inc[i].cogs, 1)) * 365);
    const payDays = pay.map((v, i) => (v / Math.max(inc[i].cogs, 1)) * 365);
    const ccc = recvDays.map((rd, i) => rd + invDays[i] - payDays[i]);
    r = writeTable(
      ws,
      r,
      ["Particular", ...histYears],
      [
        {
          label: "Receivable Days (DSO)",
          vals: recvDays,
          fmt: NUM_FMT_DEC,
          font: FONT_FORMULA,
        },
        {
          label: "Inventory Days (DIO)",
          vals: invDays,
          fmt: NUM_FMT_DEC,
          font: FONT_FORMULA,
        },
        {
          label: "Payable Days (DPO)",
          vals: payDays,
          fmt: NUM_FMT_DEC,
          font: FONT_FORMULA,
        },
        {
          label: "Cash Conversion Cycle (CCC)",
          vals: ccc,
          fmt: NUM_FMT_DEC,
          total: true,
        },
      ],
    );

    // Forecast NWC
    r = sectionBand(
      ws,
      r + 1,
      `4.2 WORKING CAPITAL FORECAST (${fcYears.join("–")})`,
      fcYears.length + 1,
    );
    const fRecvPct = recv[recv.length - 1] / inc[inc.length - 1].revenue;
    const fInvPct = inv[inv.length - 1] / inc[inc.length - 1].revenue;
    const fPayPct = pay[pay.length - 1] / inc[inc.length - 1].revenue;
    const fRecv = forecast.map((x) => x.revenue * fRecvPct);
    const fInv = forecast.map((x) => x.revenue * fInvPct);
    const fPay = forecast.map((x) => x.revenue * fPayPct);
    const fNwc = forecast.map((_, i) => fRecv[i] + fInv[i] - fPay[i]);
    r = writeTable(
      ws,
      r,
      ["Particular", ...fcYears],
      [
        {
          label: "Trade Receivables (E)",
          vals: fRecv,
          fmt: NUM_FMT,
          font: FONT_FORECAST,
        },
        {
          label: "Inventories (E)",
          vals: fInv,
          fmt: NUM_FMT,
          font: FONT_FORECAST,
        },
        {
          label: "Trade Payables (E)",
          vals: fPay,
          fmt: NUM_FMT,
          font: FONT_FORECAST,
        },
        {
          label: "Net Working Capital (E)",
          vals: fNwc,
          fmt: NUM_FMT,
          total: true,
        },
        {
          label: "Δ Working Capital (E)",
          vals: forecast.map((x) => x.wcChange),
          fmt: NUM_FMT,
          font: FONT_FORMULA,
        },
      ],
    );

    ws.columns = [
      { width: 40 },
      ...Array(Math.max(histYears.length, fcYears.length)).fill({ width: 14 }),
    ];
    ws.views = [{ state: "frozen", xSplit: 1, ySplit: 4 }];
  }

  // =================================================================
  // SHEET 6 — CASH FLOW STATEMENT
  // =================================================================
  {
    const ws = wb.addWorksheet("Cash Flow", {
      properties: { tabColor: { argb: "FF70AD47" } },
    });
    setTitle(
      ws,
      "5. CASH FLOW STATEMENT",
      "CFO = Operations · CFI = Investing · CFF = Financing — ₹ Crores",
      histYears.length + 1,
    );

    let r = 4;
    r = sectionBand(
      ws,
      r,
      "A. CASH FROM OPERATING ACTIVITIES (CFO)",
      histYears.length + 1,
    );
    r = writeTable(
      ws,
      r,
      ["Particular", ...histYears],
      [
        { label: "Net Income (PAT)", vals: cf.map((x) => x.pat), fmt: NUM_FMT },
        {
          label: "(+) Depreciation & Amortization",
          vals: cf.map((x) => x.da),
          fmt: NUM_FMT,
        },
        {
          label: "(−) Change in Working Capital",
          vals: cf.map((x) => -x.wcChange),
          fmt: NUM_FMT,
        },
        {
          label: "Net Cash from Operations (CFO)",
          vals: cf.map((x) => x.cfo),
          fmt: NUM_FMT,
          subtotal: true,
        },
        {
          label: "CFO / Revenue %",
          vals: cf.map((x, i) => x.cfo / inc[i].revenue),
          fmt: PCT_FMT,
          font: FONT_FORMULA,
        },
      ],
    );

    r = sectionBand(
      ws,
      r + 1,
      "B. CASH FROM INVESTING ACTIVITIES (CFI)",
      histYears.length + 1,
    );
    r = writeTable(
      ws,
      r,
      ["Particular", ...histYears],
      [
        {
          label: "Capital Expenditure (Capex)",
          vals: cf.map((x) => -x.capex),
          fmt: NUM_FMT,
        },
        {
          label: "Capex / Revenue %",
          vals: cf.map((x, i) => x.capex / inc[i].revenue),
          fmt: PCT_FMT,
          font: FONT_FORMULA,
        },
        {
          label: "Net Cash from Investing (CFI)",
          vals: cf.map((x) => x.cfi),
          fmt: NUM_FMT,
          subtotal: true,
        },
      ],
    );

    r = sectionBand(
      ws,
      r + 1,
      "C. CASH FROM FINANCING ACTIVITIES (CFF)",
      histYears.length + 1,
    );
    r = writeTable(
      ws,
      r,
      ["Particular", ...histYears],
      [
        {
          label: "Debt Issued / (Repaid)",
          vals: cf.map((x) => x.debtChange),
          fmt: NUM_FMT,
        },
        {
          label: "Dividends Paid",
          vals: cf.map((x) => -x.dividends),
          fmt: NUM_FMT,
        },
        {
          label: "Net Cash from Financing (CFF)",
          vals: cf.map((x) => x.cff),
          fmt: NUM_FMT,
          subtotal: true,
        },
      ],
    );

    r = sectionBand(ws, r + 1, "CASH POSITION", histYears.length + 1);
    const opening = cf.map((_, i) =>
      i === 0 ? c.history[0].cash - cf[0].netCash : c.history[i - 1].cash,
    );
    r = writeTable(
      ws,
      r,
      ["Particular", ...histYears],
      [
        { label: "Opening Cash Balance", vals: opening, fmt: NUM_FMT },
        {
          label: "Net Change in Cash",
          vals: cf.map((x) => x.netCash),
          fmt: NUM_FMT,
        },
        {
          label: "Closing Cash Balance",
          vals: c.history.map((x) => x.cash),
          fmt: NUM_FMT,
          total: true,
        },
      ],
    );

    // 5.2 FCFF Derivation
    r = sectionBand(
      ws,
      r + 1,
      "5.2 FREE CASH FLOW TO FIRM (FCFF) — DERIVED",
      histYears.length + 1,
    );
    const histTaxRate = c.taxRate;
    const nopat = inc.map((x) => x.ebit * (1 - histTaxRate));
    const fcff = nopat.map(
      (n, i) =>
        n + inc[i].da - c.history[i].capex - (i === 0 ? 0 : cf[i].wcChange),
    );
    r = writeTable(
      ws,
      r,
      ["Particular", ...histYears],
      [
        { label: "EBIT", vals: inc.map((x) => x.ebit), fmt: NUM_FMT },
        {
          label: `Less: Tax on EBIT (${(histTaxRate * 100).toFixed(1)}%)`,
          vals: inc.map((x) => -x.ebit * histTaxRate),
          fmt: NUM_FMT,
        },
        { label: "NOPAT", vals: nopat, fmt: NUM_FMT, subtotal: true },
        {
          label: "Add: Depreciation",
          vals: inc.map((x) => x.da),
          fmt: NUM_FMT,
        },
        {
          label: "Less: Capital Expenditure",
          vals: c.history.map((x) => -x.capex),
          fmt: NUM_FMT,
        },
        {
          label: "Less: Δ Working Capital",
          vals: cf.map((x, i) => (i === 0 ? "—" : -x.wcChange)),
          fmt: NUM_FMT,
        },
        {
          label: "FREE CASH FLOW TO FIRM",
          vals: fcff,
          fmt: NUM_FMT,
          total: true,
        },
      ],
    );

    ws.columns = [{ width: 42 }, ...histYears.map(() => ({ width: 14 }))];
    ws.views = [{ state: "frozen", xSplit: 1, ySplit: 4 }];
  }

  // =================================================================
  // SHEET 7 — RATIO ANALYSIS
  // =================================================================
  {
    const ws = wb.addWorksheet("Ratios", {
      properties: { tabColor: { argb: "FFFFC000" } },
    });
    setTitle(
      ws,
      "6. RATIO ANALYSIS",
      "Profitability · Liquidity · Efficiency · Leverage",
      histYears.length + 1,
    );
    let r = 4;

    r = sectionBand(ws, r, "PROFITABILITY RATIOS", histYears.length + 1);
    r = writeTable(
      ws,
      r,
      ["Ratio", ...histYears],
      [
        {
          label: "Gross Profit Margin %",
          vals: ratios.map((x) => x.grossMargin),
          fmt: PCT_FMT,
          font: FONT_FORMULA,
        },
        {
          label: "EBITDA Margin %",
          vals: ratios.map((x) => x.ebitdaMargin),
          fmt: PCT_FMT,
          font: FONT_FORMULA,
        },
        {
          label: "EBIT Margin %",
          vals: ratios.map((x) => x.ebitMargin),
          fmt: PCT_FMT,
          font: FONT_FORMULA,
        },
        {
          label: "Net Profit Margin %",
          vals: ratios.map((x) => x.netMargin),
          fmt: PCT_FMT,
          font: FONT_FORMULA,
        },
        {
          label: "Return on Equity (ROE) %",
          vals: ratios.map((x) => x.roe),
          fmt: PCT_FMT,
          font: FONT_FORMULA,
        },
        {
          label: "Return on Assets (ROA) %",
          vals: inc.map((x, i) => x.pat / bal[i].totalAssets),
          fmt: PCT_FMT,
          font: FONT_FORMULA,
        },
        {
          label: "Return on Capital Employed (ROCE) %",
          vals: ratios.map((x) => x.roce),
          fmt: PCT_FMT,
          font: FONT_FORMULA,
        },
      ],
    );

    r = sectionBand(ws, r + 1, "LIQUIDITY RATIOS", histYears.length + 1);
    r = writeTable(
      ws,
      r,
      ["Ratio", ...histYears],
      [
        {
          label: "Current Ratio (x)",
          vals: ratios.map((x) => x.currentRatio),
          fmt: NUM_FMT_DEC,
          font: FONT_FORMULA,
        },
        {
          label: "Quick Ratio (x)",
          vals: bal.map(
            (x) =>
              (x.currentAssets - x.inventory) /
              Math.max(x.currentLiabilities, 1),
          ),
          fmt: NUM_FMT_DEC,
          font: FONT_FORMULA,
        },
        {
          label: "Cash Ratio (x)",
          vals: bal.map((x) => x.cash / Math.max(x.currentLiabilities, 1)),
          fmt: NUM_FMT_DEC,
          font: FONT_FORMULA,
        },
      ],
    );

    r = sectionBand(ws, r + 1, "EFFICIENCY RATIOS", histYears.length + 1);
    const recvDays = c.history.map(
      (x, i) => (x.receivables / inc[i].revenue) * 365,
    );
    const invDays = c.history.map(
      (x, i) => (x.inventory / Math.max(inc[i].cogs, 1)) * 365,
    );
    const payDays = c.history.map(
      (x, i) => (x.payables / Math.max(inc[i].cogs, 1)) * 365,
    );
    r = writeTable(
      ws,
      r,
      ["Ratio", ...histYears],
      [
        {
          label: "Inventory Days",
          vals: invDays,
          fmt: NUM_FMT_DEC,
          font: FONT_FORMULA,
        },
        {
          label: "Receivable Days",
          vals: recvDays,
          fmt: NUM_FMT_DEC,
          font: FONT_FORMULA,
        },
        {
          label: "Payable Days",
          vals: payDays,
          fmt: NUM_FMT_DEC,
          font: FONT_FORMULA,
        },
        {
          label: "Cash Conversion Cycle (Days)",
          vals: recvDays.map((d, i) => d + invDays[i] - payDays[i]),
          fmt: NUM_FMT_DEC,
          font: FONT_FORMULA,
        },
        {
          label: "Asset Turnover (x)",
          vals: ratios.map((x) => x.assetTurnover),
          fmt: NUM_FMT_DEC,
          font: FONT_FORMULA,
        },
        {
          label: "Inventory Turnover (x)",
          vals: inc.map((x, i) => x.cogs / Math.max(c.history[i].inventory, 1)),
          fmt: NUM_FMT_DEC,
          font: FONT_FORMULA,
        },
      ],
    );

    r = sectionBand(ws, r + 1, "LEVERAGE RATIOS", histYears.length + 1);
    r = writeTable(
      ws,
      r,
      ["Ratio", ...histYears],
      [
        {
          label: "Debt-to-Equity (x)",
          vals: ratios.map((x) => x.debtEquity),
          fmt: NUM_FMT_DEC,
          font: FONT_FORMULA,
        },
        {
          label: "Interest Coverage (x)",
          vals: inc.map((x) => (x.interest > 0 ? x.ebit / x.interest : 0)),
          fmt: NUM_FMT_DEC,
          font: FONT_FORMULA,
        },
        {
          label: "Net Debt (₹ Cr)",
          vals: c.history.map((x) => x.longDebt + x.shortDebt - x.cash),
          fmt: NUM_FMT,
        },
        {
          label: "Total Debt / EBITDA (x)",
          vals: c.history.map(
            (x, i) => (x.longDebt + x.shortDebt) / Math.max(inc[i].ebitda, 1),
          ),
          fmt: NUM_FMT_DEC,
          font: FONT_FORMULA,
        },
      ],
    );

    ws.columns = [{ width: 40 }, ...histYears.map(() => ({ width: 13 }))];
    ws.views = [{ state: "frozen", xSplit: 1, ySplit: 4 }];
  }

  // =================================================================
  // SHEET 8 — FCFF & WACC
  // =================================================================
  {
    const ws = wb.addWorksheet("FCFF & WACC", {
      properties: { tabColor: { argb: "FFED7D31" } },
    });
    setTitle(
      ws,
      "7. FREE CASH FLOW TO FIRM (FCFF) & WACC",
      "Cash available to all capital providers — ₹ Crores",
      histYears.length + 1,
    );

    // 7.1 WACC
    let r = 4;
    r = sectionBand(ws, r, "7.1 WACC CALCULATION", 2);
    const dcfIn = defaultDCFInputs(c);
    const debt = lastRow.longDebt + lastRow.shortDebt;
    const equityWeight = mktCap / (mktCap + debt);
    const debtWeight = debt / (mktCap + debt);
    const wacc: [string, number, string][] = [
      ["Risk-Free Rate (Rf) — 10Y G-Sec", c.riskFreeRate, PCT_FMT],
      ["Market Return (Rm)", c.riskFreeRate + c.marketRiskPremium, PCT_FMT],
      ["Equity Risk Premium (Rm − Rf)", c.marketRiskPremium, PCT_FMT],
      ["Beta (β) — 5Y vs Nifty", c.beta, NUM_FMT_DEC],
      ["Cost of Equity [Ke = Rf + β × ERP]", dcf.costOfEquity, PCT_FMT],
      ["Pre-Tax Cost of Debt", c.costOfDebt, PCT_FMT],
      ["Effective Tax Rate", c.taxRate, PCT_FMT],
      [
        "Post-Tax Cost of Debt [Kd × (1−T)]",
        c.costOfDebt * (1 - c.taxRate),
        PCT_FMT,
      ],
      ["Market Capitalization (₹ Cr)", mktCap, NUM_FMT],
      ["Total Debt (₹ Cr)", debt, NUM_FMT],
      ["Equity Weight", equityWeight, PCT_FMT],
      ["Debt Weight", debtWeight, PCT_FMT],
      ["WACC", dcf.wacc, PCT_FMT],
    ];
    const hdr = ws.getRow(r);
    hdr.getCell(1).value = "Parameter";
    hdr.getCell(2).value = "Value";
    styleHeaderRow(ws, r);
    r++;
    wacc.forEach((row, i) => {
      const rr = ws.getRow(r + i);
      rr.getCell(1).value = row[0];
      rr.getCell(1).font = FONT_BOLD;
      rr.getCell(2).value = row[1];
      rr.getCell(2).numFmt = row[2];
      const isLast = i === wacc.length - 1;
      rr.getCell(2).font = isLast
        ? { ...FONT_BOLD, color: { argb: "FFC00000" } }
        : FONT_FORMULA;
      if (isLast) {
        rr.getCell(1).fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: COLOR.totalFill,
        };
        rr.getCell(2).fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: COLOR.totalFill,
        };
      }
    });
    r += wacc.length + 1;

    // 7.2 Historical FCFF
    const histTaxRate = c.taxRate;
    const nopatH = inc.map((x) => x.ebit * (1 - histTaxRate));
    const fcffH = nopatH.map(
      (n, i) =>
        n + inc[i].da - c.history[i].capex - (i === 0 ? 0 : cf[i].wcChange),
    );
    r = sectionBand(
      ws,
      r,
      "7.2 HISTORICAL FCFF DERIVATION",
      histYears.length + 1,
    );
    r = writeTable(
      ws,
      r,
      ["Particular", ...histYears],
      [
        { label: "EBIT", vals: inc.map((x) => x.ebit), fmt: NUM_FMT },
        {
          label: "Tax on EBIT",
          vals: inc.map((x) => -x.ebit * histTaxRate),
          fmt: NUM_FMT,
        },
        {
          label: "NOPAT [EBIT × (1−T)]",
          vals: nopatH,
          fmt: NUM_FMT,
          subtotal: true,
        },
        {
          label: "Add: Depreciation",
          vals: inc.map((x) => x.da),
          fmt: NUM_FMT,
        },
        {
          label: "Less: Capex",
          vals: c.history.map((x) => -x.capex),
          fmt: NUM_FMT,
        },
        {
          label: "Less: Δ Working Capital",
          vals: cf.map((x, i) => (i === 0 ? "—" : -x.wcChange)),
          fmt: NUM_FMT,
        },
        {
          label: "FREE CASH FLOW TO FIRM",
          vals: fcffH,
          fmt: NUM_FMT,
          total: true,
        },
        {
          label: "FCFF / Revenue %",
          vals: fcffH.map((v, i) => v / inc[i].revenue),
          fmt: PCT_FMT,
          font: FONT_FORMULA,
        },
      ],
    );

    // 7.3 Forecast FCFF
    r = sectionBand(ws, r + 1, "7.3 FORECASTED FCFF", fcYears.length + 1);
    r = writeTable(
      ws,
      r,
      ["Particular", ...fcYears],
      [
        {
          label: "EBIT (E)",
          vals: forecast.map((x) => x.ebit),
          fmt: NUM_FMT,
          font: FONT_FORECAST,
        },
        {
          label: "Tax on EBIT (E)",
          vals: forecast.map((x) => -x.ebit * (f.taxRate / 100)),
          fmt: NUM_FMT,
          font: FONT_FORECAST,
        },
        {
          label: "NOPAT (E)",
          vals: forecast.map((x) => x.ebit * (1 - f.taxRate / 100)),
          fmt: NUM_FMT,
          subtotal: true,
        },
        {
          label: "Add: Depreciation (E)",
          vals: forecast.map((x) => x.da),
          fmt: NUM_FMT,
          font: FONT_FORECAST,
        },
        {
          label: "Less: Capex (E)",
          vals: forecast.map((x) => -x.capex),
          fmt: NUM_FMT,
          font: FONT_FORECAST,
        },
        {
          label: "Δ Working Capital (E)",
          vals: forecast.map((x) => -x.wcChange),
          fmt: NUM_FMT,
          font: FONT_FORECAST,
        },
        {
          label: "FREE CASH FLOW TO FIRM (E)",
          vals: forecast.map((x) => x.fcf),
          fmt: NUM_FMT,
          total: true,
        },
      ],
    );

    void dcfIn;
    ws.columns = [
      { width: 42 },
      ...Array(Math.max(histYears.length, fcYears.length)).fill({ width: 14 }),
    ];
    ws.views = [{ state: "frozen", xSplit: 1, ySplit: 4 }];
  }

  // =================================================================
  // SHEET 9 — DCF VALUATION
  // =================================================================
  {
    const ws = wb.addWorksheet("DCF Valuation", {
      properties: { tabColor: { argb: "FFC00000" } },
    });
    setTitle(
      ws,
      "8. DCF VALUATION",
      `Discounted Cash Flow — ₹ Crores · Intrinsic value per share in ₹`,
      6,
    );

    // 8.1 PV of FCFF
    let r = 4;
    r = sectionBand(
      ws,
      r,
      "8.1 PRESENT VALUE OF FORECAST FCFF",
      fcYears.length + 1,
    );
    const discFactors = forecast.map(
      (_, i) => 1 / Math.pow(1 + dcf.wacc, i + 1),
    );
    const pvFcfArr = forecast.map((x, i) => x.fcf * discFactors[i]);
    r = writeTable(
      ws,
      r,
      ["Particular", ...fcYears],
      [
        {
          label: "FCFF (E)",
          vals: forecast.map((x) => x.fcf),
          fmt: NUM_FMT,
          font: FONT_FORECAST,
        },
        { label: "Year (n)", vals: forecast.map((_, i) => i + 1), fmt: "0" },
        {
          label: "Discount Factor [1/(1+WACC)^n]",
          vals: discFactors,
          fmt: NUM_FMT_DEC,
          font: FONT_FORMULA,
        },
        {
          label: "Present Value of FCFF",
          vals: pvFcfArr,
          fmt: NUM_FMT,
          total: true,
        },
      ],
    );

    const sumPv = pvFcfArr.reduce((a, b) => a + b, 0);
    ws.getCell(`A${r}`).value = "Sum of PV (Explicit Period)";
    ws.getCell(`A${r}`).font = FONT_BOLD;
    ws.getCell(`B${r}`).value = sumPv;
    ws.getCell(`B${r}`).numFmt = NUM_FMT;
    ws.getCell(`B${r}`).font = { ...FONT_BOLD, color: { argb: "FFC00000" } };
    r += 2;

    // 8.2 Terminal Value & EV
    r = sectionBand(ws, r, "8.2 TERMINAL VALUE & ENTERPRISE VALUE", 2);
    const tg = 0.04;
    const lastFcf = forecast[forecast.length - 1].fcf;
    const tvBlock: [string, number, string][] = [
      ["FCFF (Year n+1)", lastFcf * (1 + tg), NUM_FMT],
      ["Terminal Growth Rate (g)", tg, PCT_FMT],
      ["WACC", dcf.wacc, PCT_FMT],
      ["Terminal Value [FCFF×(1+g)/(WACC−g)]", dcf.terminalValue, NUM_FMT],
      ["PV of Terminal Value", dcf.pvTerminal, NUM_FMT],
      ["% of Enterprise Value", dcf.pvTerminal / dcf.enterpriseValue, PCT_FMT],
      ["Sum of PV of FCFF (Explicit)", dcf.pvFcf, NUM_FMT],
      ["ENTERPRISE VALUE", dcf.enterpriseValue, NUM_FMT],
      ["Less: Net Debt", dcf.netDebt, NUM_FMT],
      ["EQUITY VALUE", dcf.equityValue, NUM_FMT],
      ["Number of Shares (Cr)", sharesCr, NUM_FMT_DEC],
      ["INTRINSIC VALUE PER SHARE", dcf.intrinsicPrice, RS_FMT],
      ["Current Market Price (CMP)", c.cmp, RS_FMT],
      ["Premium / (Discount) to CMP", dcf.upside, PCT_FMT],
    ];
    const tvHdr = ws.getRow(r);
    tvHdr.getCell(1).value = "Parameter";
    tvHdr.getCell(2).value = "Value";
    styleHeaderRow(ws, r);
    r++;
    tvBlock.forEach((row, i) => {
      const rr = ws.getRow(r + i);
      rr.getCell(1).value = row[0];
      rr.getCell(1).font = FONT_BOLD;
      rr.getCell(2).value = row[1];
      rr.getCell(2).numFmt = row[2];
      const highlight = [
        "ENTERPRISE VALUE",
        "EQUITY VALUE",
        "INTRINSIC VALUE PER SHARE",
        "Premium / (Discount) to CMP",
      ].includes(row[0]);
      rr.getCell(2).font = highlight
        ? { ...FONT_BOLD, color: { argb: "FFC00000" } }
        : FONT_FORMULA;
      if (highlight) {
        rr.getCell(1).fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: COLOR.totalFill,
        };
        rr.getCell(2).fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: COLOR.totalFill,
        };
      }
    });

    ws.columns = [
      { width: 44 },
      { width: 18 },
      { width: 16 },
      { width: 16 },
      { width: 16 },
      { width: 16 },
    ];
    ws.views = [{ state: "frozen", xSplit: 1, ySplit: 4 }];
  }

  // =================================================================
  // SHEET 10 — PRICE VALUATION SUMMARY
  // =================================================================
  {
    const ws = wb.addWorksheet("Valuation Summary", {
      properties: { tabColor: { argb: "FF7030A0" } },
    });
    setTitle(
      ws,
      "9. PRICE VALUATION SUMMARY",
      "Scorecard · Scenarios · Investment Thesis · Recommendation",
      6,
    );
    let r = 4;

    // 9.1 Scorecard
    r = sectionBand(ws, r, "9.1 VALUATION SCORECARD", 4);
    const signal = (cond: "good" | "bad" | "neutral", text: string) => text;
    const score: [
      string,
      string,
      string,
      (
        | "OVERVALUED"
        | "UNDERVALUED"
        | "IN LINE"
        | "STRONG"
        | "EXCELLENT"
        | "BELOW PEER"
        | "ADEQUATE"
        | "POSITIVE"
        | "DEBT FREE"
      ),
    ][] = [
      [
        "DCF Intrinsic Value",
        `₹${dcf.intrinsicPrice.toFixed(2)}`,
        `CMP ₹${c.cmp}`,
        dcf.upside < -0.1
          ? "OVERVALUED"
          : dcf.upside > 0.1
            ? "UNDERVALUED"
            : "IN LINE",
      ],
      [
        "Gross Margin",
        `${((lastHist.grossProfit / lastHist.revenue) * 100).toFixed(2)}%`,
        "Sector ~30-55%",
        "IN LINE",
      ],
      [
        "EBITDA Margin",
        `${((lastHist.ebitda / lastHist.revenue) * 100).toFixed(2)}%`,
        "Sector ~15-25%",
        "STRONG",
      ],
      [
        "Net Margin",
        `${((lastHist.pat / lastHist.revenue) * 100).toFixed(2)}%`,
        "Sector ~8-18%",
        "IN LINE",
      ],
      [
        "ROE",
        `${(ratios[ratios.length - 1].roe * 100).toFixed(2)}%`,
        "Peer avg ~15-22%",
        ratios[ratios.length - 1].roe > 0.18 ? "STRONG" : "BELOW PEER",
      ],
      [
        "ROCE",
        `${(ratios[ratios.length - 1].roce * 100).toFixed(2)}%`,
        "Peer avg ~15-22%",
        "IN LINE",
      ],
      [
        "D/E Ratio",
        `${ratios[ratios.length - 1].debtEquity.toFixed(2)}x`,
        "< 0.5x healthy",
        ratios[ratios.length - 1].debtEquity < 0.5 ? "EXCELLENT" : "ADEQUATE",
      ],
      [
        "Interest Coverage",
        `${(lastHist.ebit / Math.max(lastHist.interest, 0.01)).toFixed(1)}x`,
        "> 8x comfortable",
        "STRONG",
      ],
      [
        "Current Ratio",
        `${ratios[ratios.length - 1].currentRatio.toFixed(2)}x`,
        "> 1.5x ideal",
        "ADEQUATE",
      ],
      [
        "Net Debt (₹ Cr)",
        `${(lastRow.longDebt + lastRow.shortDebt - lastRow.cash).toFixed(0)}`,
        "Lower better",
        lastRow.longDebt + lastRow.shortDebt - lastRow.cash < 0
          ? "DEBT FREE"
          : "ADEQUATE",
      ],
    ];
    void signal;
    const sh = ws.getRow(r);
    ["Metric", "FY Value", "Benchmark", "Signal"].forEach(
      (h, i) => (sh.getCell(1 + i).value = h),
    );
    styleHeaderRow(ws, r);
    r++;
    score.forEach((s, i) => {
      const rr = ws.getRow(r + i);
      s.forEach((v, j) => {
        rr.getCell(1 + j).value = v;
      });
      rr.getCell(1).font = FONT_BOLD;
      const sig = s[3];
      const color = ["OVERVALUED", "BELOW PEER"].includes(sig)
        ? "FFC00000"
        : [
              "EXCELLENT",
              "STRONG",
              "DEBT FREE",
              "UNDERVALUED",
              "POSITIVE",
            ].includes(sig)
          ? "FF006100"
          : "FF7F6000";
      rr.getCell(4).font = { ...FONT_BOLD, color: { argb: color } };
    });
    r += score.length + 1;

    // 9.2 Scenario Analysis
    r = sectionBand(ws, r, "9.2 PRICE TARGET & SCENARIO ANALYSIS", 6);
    const baseDcf = defaultDCFInputs(c);
    const scen = scenarios(c, f, baseDcf);
    const scHdr = ws.getRow(r);
    [
      "Scenario",
      "Revenue Growth",
      "EBITDA Margin",
      "Intrinsic (₹)",
      "Upside/Downside",
      "Rating",
    ].forEach((h, i) => (scHdr.getCell(1 + i).value = h));
    styleHeaderRow(ws, r);
    r++;
    scen.forEach((s, i) => {
      const rr = ws.getRow(r + i);
      const rating =
        s.upside > 0.15 ? "BUY" : s.upside < -0.1 ? "SELL" : "HOLD";
      rr.getCell(1).value = s.name;
      rr.getCell(1).font = FONT_BOLD;
      rr.getCell(2).value = s.growth / 100;
      rr.getCell(2).numFmt = PCT_FMT;
      rr.getCell(3).value = s.margin / 100;
      rr.getCell(3).numFmt = PCT_FMT;
      rr.getCell(4).value = s.price;
      rr.getCell(4).numFmt = RS_FMT;
      rr.getCell(5).value = s.upside;
      rr.getCell(5).numFmt = PCT_FMT;
      rr.getCell(6).value = rating;
      rr.getCell(6).font = {
        ...FONT_BOLD,
        color: {
          argb:
            rating === "BUY"
              ? "FF006100"
              : rating === "SELL"
                ? "FFC00000"
                : "FF7F6000",
        },
      };
    });
    r += scen.length + 1;

    // 9.3 Relative Valuation
    r = sectionBand(ws, r, "9.3 RELATIVE VALUATION MULTIPLES", 2);
    const relRows: [string, number, string][] = [
      ["Market Cap (₹ Cr)", rel.marketCap, NUM_FMT],
      ["Enterprise Value (₹ Cr)", rel.enterpriseValue, NUM_FMT],
      ["P/E (x)", rel.pe, NUM_FMT_DEC],
      ["P/B (x)", rel.pb, NUM_FMT_DEC],
      ["EV / EBITDA (x)", rel.evEbitda, NUM_FMT_DEC],
      ["EV / Revenue (x)", rel.evRevenue, NUM_FMT_DEC],
    ];
    const rh = ws.getRow(r);
    rh.getCell(1).value = "Multiple";
    rh.getCell(2).value = "Value";
    styleHeaderRow(ws, r);
    r++;
    relRows.forEach((row, i) => {
      const rr = ws.getRow(r + i);
      rr.getCell(1).value = row[0];
      rr.getCell(1).font = FONT_BOLD;
      rr.getCell(2).value = row[1];
      rr.getCell(2).numFmt = row[2];
      rr.getCell(2).font = FONT_FORMULA;
    });
    r += relRows.length + 1;

    // 9.4 Final Recommendation
    r = sectionBand(ws, r, "9.4 FINAL INVESTMENT RECOMMENDATION", 6);
    const reco =
      dcf.upside > 0.2
        ? "BUY"
        : dcf.upside > 0.05
          ? "ACCUMULATE"
          : dcf.upside > -0.1
            ? "HOLD"
            : "REDUCE / SELL";
    const recoColor =
      reco === "BUY"
        ? "FF006100"
        : reco === "REDUCE / SELL"
          ? "FFC00000"
          : "FF7F6000";
    ws.getCell(`A${r}`).value = "Rating:";
    ws.getCell(`A${r}`).font = FONT_BOLD;
    ws.getCell(`B${r}`).value = reco;
    ws.getCell(`B${r}`).font = {
      ...FONT_BOLD,
      size: 14,
      color: { argb: recoColor },
    };
    r++;
    ws.getCell(`A${r}`).value = "12-Month Target (DCF):";
    ws.getCell(`A${r}`).font = FONT_BOLD;
    ws.getCell(`B${r}`).value = dcf.intrinsicPrice;
    ws.getCell(`B${r}`).numFmt = RS_FMT;
    ws.getCell(`B${r}`).font = { ...FONT_BOLD, color: { argb: "FFC00000" } };
    r++;
    ws.getCell(`A${r}`).value = "Current Market Price:";
    ws.getCell(`A${r}`).font = FONT_BOLD;
    ws.getCell(`B${r}`).value = c.cmp;
    ws.getCell(`B${r}`).numFmt = RS_FMT;
    r += 2;
    ws.mergeCells(`A${r}:F${r + 4}`);
    ws.getCell(`A${r}`).value =
      `Rationale: ${c.name} (${c.ticker}) trades at ₹${c.cmp} vs DCF intrinsic value of ₹${dcf.intrinsicPrice.toFixed(2)} (${(dcf.upside * 100).toFixed(1)}% ${dcf.upside >= 0 ? "upside" : "downside"}). The model assumes ${f.revenueGrowth.toFixed(1)}% revenue growth, ${f.ebitdaMargin.toFixed(1)}% EBITDA margin, WACC of ${(dcf.wacc * 100).toFixed(2)}% and 4.0% terminal growth. Investors should validate underlying assumptions against latest BSE/NSE filings and the company's most recent annual report before any decision.\n\nDISCLAIMER: This is a model-generated analytical report for educational purposes only and does NOT constitute investment advice.`;
    ws.getCell(`A${r}`).alignment = { wrapText: true, vertical: "top" };
    ws.getCell(`A${r}`).font = { ...FONT_BASE, italic: true };

    ws.columns = [
      { width: 32 },
      { width: 22 },
      { width: 22 },
      { width: 18 },
      { width: 18 },
      { width: 18 },
    ];
    ws.views = [{ state: "frozen", ySplit: 3 }];
  }

  void projectForecast;
  void runDCF; // imports used elsewhere may be tree-shaken

  // ============ Save ============
  const buf = await wb.xlsx.writeBuffer();
  const safeName = c.name.replace(/[^a-zA-Z0-9]+/g, "_").replace(/^_|_$/g, "");
  const fileName = `${safeName}_Financial_Model_${today}.xlsx`;
  const blob = new Blob([buf], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    URL.revokeObjectURL(url);
    a.remove();
  }, 0);
}

export function exportPdfReport(c: Company, markdown: string, dcf: DCFResult) {
  const doc = new jsPDF();
  const rel = relativeValuation(c);

  // Cover
  doc.setFontSize(22);
  doc.text(c.name, 14, 24);
  doc.setFontSize(11);
  doc.setTextColor(120);
  doc.text(
    `NSE: ${c.ticker}${c.bse ? `  •  BSE: ${c.bse}` : ""}  •  ${c.sector}`,
    14,
    32,
  );
  doc.setTextColor(0);
  doc.setFontSize(10);
  const summary = [
    ["CMP", `₹${c.cmp}`],
    ["Market Cap", `₹${(rel.marketCap / 1e5).toFixed(2)} L Cr`],
    ["Enterprise Value", `₹${(rel.enterpriseValue / 1e5).toFixed(2)} L Cr`],
    [
      "PE / PB / EV-EBITDA",
      `${rel.pe.toFixed(1)}x / ${rel.pb.toFixed(1)}x / ${rel.evEbitda.toFixed(1)}x`,
    ],
    ["WACC", `${(dcf.wacc * 100).toFixed(2)}%`],
    ["DCF Intrinsic Price", `₹${dcf.intrinsicPrice.toFixed(0)}`],
    ["Implied Upside", `${(dcf.upside * 100).toFixed(1)}%`],
  ];
  autoTable(doc, {
    startY: 40,
    body: summary,
    theme: "grid",
    styles: { fontSize: 9 },
  });

  // Markdown body (simple renderer: split by \n, treat ## as headings)
  const lines = markdown.split("\n");
  let y =
    (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable
      ?.finalY ?? 100;
  y += 8;
  const pageHeight = doc.internal.pageSize.getHeight();
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) {
      y += 3;
      continue;
    }
    if (y > pageHeight - 18) {
      doc.addPage();
      y = 18;
    }
    if (line.startsWith("## ")) {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(13);
      doc.text(line.replace(/^##\s*/, ""), 14, y);
      y += 7;
    } else if (line.startsWith("### ")) {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(11);
      doc.text(line.replace(/^###\s*/, ""), 14, y);
      y += 6;
    } else if (line.startsWith("- ") || line.startsWith("* ")) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      const text = "• " + line.replace(/^[-*]\s*/, "");
      const wrapped = doc.splitTextToSize(text, 180);
      doc.text(wrapped, 18, y);
      y += 5 * wrapped.length;
    } else {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      const wrapped = doc.splitTextToSize(line.replace(/\*\*/g, ""), 182);
      doc.text(wrapped, 14, y);
      y += 5 * wrapped.length;
    }
  }
  doc.save(`${c.ticker}_Research_Report.pdf`);
}

export async function exportPptxMemo(
  c: Company,
  dcf: DCFResult,
  headlines: string[],
) {
  const pptx = new PptxGenJS();
  const rel = relativeValuation(c);
  pptx.layout = "LAYOUT_WIDE";

  const dark = "0F1218";
  const amber = "F2B33D";
  const text = "F4F1E8";

  // Cover
  const s1 = pptx.addSlide();
  s1.background = { color: dark };
  s1.addText(c.name, {
    x: 0.5,
    y: 1.2,
    w: 12,
    h: 1,
    fontSize: 44,
    bold: true,
    color: text,
    fontFace: "Inter",
  });
  s1.addText(`NSE: ${c.ticker}  •  ${c.sector}`, {
    x: 0.5,
    y: 2.4,
    w: 12,
    h: 0.6,
    fontSize: 18,
    color: amber,
    fontFace: "JetBrains Mono",
  });
  s1.addText("AI-Generated Investment Memo", {
    x: 0.5,
    y: 6.2,
    fontSize: 14,
    color: text,
  });

  // Snapshot
  const s2 = pptx.addSlide();
  s2.background = { color: dark };
  s2.addText("Snapshot", {
    x: 0.5,
    y: 0.3,
    fontSize: 28,
    bold: true,
    color: amber,
  });
  const snapshot = [
    ["CMP", `₹${c.cmp}`],
    ["Market Cap", `₹${(rel.marketCap / 1e5).toFixed(2)} L Cr`],
    ["EV", `₹${(rel.enterpriseValue / 1e5).toFixed(2)} L Cr`],
    ["PE / PB", `${rel.pe.toFixed(1)}x / ${rel.pb.toFixed(1)}x`],
    ["EV/EBITDA", `${rel.evEbitda.toFixed(1)}x`],
    ["WACC", `${(dcf.wacc * 100).toFixed(2)}%`],
    ["DCF Intrinsic", `₹${dcf.intrinsicPrice.toFixed(0)}`],
    ["Upside", `${(dcf.upside * 100).toFixed(1)}%`],
  ];
  s2.addTable(
    snapshot.map(([k, v]) => [
      { text: k, options: { color: text, fontFace: "Inter", bold: true } },
      { text: v, options: { color: amber, fontFace: "JetBrains Mono" } },
    ]),
    { x: 0.5, y: 1.2, w: 6, fontSize: 16 },
  );

  // Thesis
  const s3 = pptx.addSlide();
  s3.background = { color: dark };
  s3.addText("Investment Thesis", {
    x: 0.5,
    y: 0.3,
    fontSize: 28,
    bold: true,
    color: amber,
  });
  s3.addText(
    headlines.map((h) => ({
      text: h,
      options: { bullet: true, color: text, fontSize: 16 },
    })),
    {
      x: 0.5,
      y: 1.2,
      w: 12,
      h: 5.5,
    },
  );

  // Recommendation
  const s4 = pptx.addSlide();
  s4.background = { color: dark };
  const reco = dcf.upside > 0.15 ? "BUY" : dcf.upside < -0.1 ? "SELL" : "HOLD";
  const recoColor =
    reco === "BUY" ? "5EE0A0" : reco === "SELL" ? "F0666B" : amber;
  s4.addText("Recommendation", {
    x: 0.5,
    y: 0.3,
    fontSize: 28,
    bold: true,
    color: amber,
  });
  s4.addText(reco, {
    x: 0.5,
    y: 2,
    fontSize: 100,
    bold: true,
    color: recoColor,
  });
  s4.addText(
    `12M Target: ₹${dcf.intrinsicPrice.toFixed(0)}  •  Upside: ${(dcf.upside * 100).toFixed(1)}%`,
    { x: 0.5, y: 5, fontSize: 20, color: text },
  );
  s4.addText("Generated from seeded data. Not investment advice.", {
    x: 0.5,
    y: 6.8,
    fontSize: 11,
    color: "888888",
    italic: true,
  });

  await pptx.writeFile({ fileName: `${c.ticker}_Investment_Memo.pptx` });
}

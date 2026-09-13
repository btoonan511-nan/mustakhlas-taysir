import * as XLSX from "xlsx";
import { readFileSync } from "node:fs";

/** One installment row inside a cashbox account block. */
export type RawPayment = {
  seq: number | null;
  label: string;
  dateRaw: string;
  date: string | null; // ISO yyyy-mm-dd
  amount: number;
  method: string; // نقداً / تحويل / فاتورة / ...
  voucher: string;
  note: string;
};

/** An "account" block: heading → header row → payments → total row. */
export type RawAccount = {
  file: string;
  sheet: string;
  headingRaw: string;
  headingRow: number;
  payments: RawPayment[];
  declaredTotal: number | null;
  status: string; // خالص or ""
  invoicesTotal: number | null; // suppliers: sum of invoice column if present
  notes: string[];
};

const AR_DIGITS = "٠١٢٣٤٥٦٧٨٩";
export function cleanText(v: unknown): string {
  return String(v ?? "")
    .replace(/[٠-٩]/g, (d) => String(AR_DIGITS.indexOf(d)))
    .replace(/\s+/g, " ")
    .trim();
}
export function toNumber(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const t = cleanText(v).replace(/[,٬\s]/g, "").replace("٫", ".");
  if (!t || !/^-?\d+(\.\d+)?$/.test(t)) return null;
  return Number(t);
}
/** Parses 2022/10/07م, 07/10/2022, Excel serials, etc. Returns ISO or null. */
export function toIsoDate(v: unknown): string | null {
  if (typeof v === "number" && v > 20000 && v < 80000) {
    const d = new Date(Date.UTC(1899, 11, 30) + v * 86400000);
    return d.toISOString().slice(0, 10);
  }
  const t = cleanText(v).replace(/[مهـ]/g, "").trim();
  let m = t.match(/^(\d{4})[\/\-.](\d{1,2})[\/\-.](\d{1,2})$/);
  if (m) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  m = t.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  // 5-digit year typos like 20262/05/23 → assume 2026
  m = t.match(/^(\d{5})[\/\-.](\d{1,2})[\/\-.](\d{1,2})$/);
  if (m) return `${m[1].slice(0, 4)}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  return null;
}

const isHeaderCell = (c: unknown) => /^(م|الدفعات|التاريخ|المبلغ|الدفع|رقم السند|الفواتير)$/.test(cleanText(c));
const isTotalCell = (c: unknown) => /^الإج.*ي$|^الاج.*ي$|^إجمالي|^اجمالي/.test(cleanText(c).replace(/ـ/g, ""));

type Cell = string | number;

/** Locate the column layout from a header row: returns column indexes. */
function headerLayout(row: Cell[]) {
  const cols: Record<string, number> = {};
  row.forEach((c, i) => {
    const t = cleanText(c);
    if (t === "م" && cols.seq === undefined) cols.seq = i;
    else if (t === "الدفعات" && cols.label === undefined) cols.label = i;
    else if (t === "التاريخ" && cols.date === undefined) cols.date = i;
    else if (t === "المبلغ" && cols.amount === undefined) cols.amount = i;
    else if (t === "الدفع" && cols.method === undefined) cols.method = i;
    else if (t === "رقم السند" && cols.voucher === undefined) cols.voucher = i;
    else if (t === "الفواتير" && cols.invoice === undefined) cols.invoice = i;
  });
  return cols;
}

/**
 * Some sheets place two account tables side by side (left block cols 0-4, right block cols 6-10).
 * We split each row at the first fully-empty separator column that follows a header "م".
 */
function splitSideBySide(rows: Cell[][]): Cell[][][] {
  // Find header rows and count how many "م" columns they have.
  const seqCols = new Set<number>();
  for (const r of rows) r.forEach((c, i) => { if (cleanText(c) === "م" && cleanText(r[i + 1]) === "الدفعات") seqCols.add(i); });
  const starts = [...seqCols].sort((a, b) => a - b);
  if (starts.length <= 1) return [rows];
  const slices: Cell[][][] = [];
  for (let k = 0; k < starts.length; k++) {
    const from = starts[k];
    const to = k + 1 < starts.length ? starts[k + 1] : Number.POSITIVE_INFINITY;
    slices.push(rows.map((r) => r.slice(from, to === Number.POSITIVE_INFINITY ? undefined : to)));
  }
  // heading rows usually sit only in the first slice; copy headings across when other slices are blank there
  return slices;
}

function parseBlockRows(rows: Cell[][], file: string, sheet: string): RawAccount[] {
  const accounts: RawAccount[] = [];
  let current: RawAccount | null = null;
  let layout: Record<string, number> | null = null;
  let pendingHeading: { text: string; row: number } | null = null;

  const isBlank = (r: Cell[]) => r.every((c) => cleanText(c) === "");

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (isBlank(row)) continue;
    const texts = row.map(cleanText);
    const headerHits = row.filter(isHeaderCell).length;

    if (headerHits >= 3) {
      // header row → start a new account block using the pending heading
      layout = headerLayout(row);
      current = {
        file, sheet,
        headingRaw: pendingHeading?.text ?? sheet,
        headingRow: pendingHeading?.row ?? i,
        payments: [], declaredTotal: null, status: "", invoicesTotal: null, notes: [],
      };
      accounts.push(current);
      pendingHeading = null;
      continue;
    }

    if (row.some(isTotalCell)) {
      if (current && layout) {
        const amt = layout.amount !== undefined ? toNumber(row[layout.amount]) : null;
        current.declaredTotal = amt ?? toNumber(row.find((c, idx) => idx !== layout!.seq && toNumber(c) !== null));
        if (texts.some((t) => /خالص/.test(t))) current.status = "خالص";
        if (layout.invoice !== undefined) current.invoicesTotal = toNumber(row[layout.invoice]);
      }
      layout = null; // block closed; next heading starts a new one
      continue;
    }

    if (current && layout) {
      const seq = layout.seq !== undefined ? toNumber(row[layout.seq]) : null;
      const label = layout.label !== undefined ? texts[layout.label] : "";
      const amount = layout.amount !== undefined ? toNumber(row[layout.amount]) : null;
      const dateRaw = layout.date !== undefined ? texts[layout.date] : "";
      if (amount !== null && amount !== 0 && (label || dateRaw)) {
        const method = layout.method !== undefined ? texts[layout.method] : "";
        const voucher = layout.voucher !== undefined ? texts[layout.voucher] : "";
        // when there's no explicit method column, the voucher column often holds نقداً/تحويل/فاتورة
        const methodGuess = method || (/^(نقد|تحويل|فاتور|شيك)/.test(voucher) ? voucher : "");
        const voucherGuess = method ? voucher : (/^(نقد|تحويل|فاتور|شيك)/.test(voucher) ? "" : voucher);
        const extra = texts.filter((t, idx) => t && ![layout!.seq, layout!.label, layout!.date, layout!.amount, layout!.method, layout!.voucher, layout!.invoice].includes(idx) && toNumber(t) === null).join(" | ");
        current.payments.push({
          seq, label, dateRaw, date: toIsoDate(dateRaw), amount,
          method: methodGuess, voucher: voucherGuess, note: extra,
        });
        continue;
      }
      if (amount === null && label === "" && seq !== null) continue; // empty numbered row
      if (texts.filter(Boolean).length === 1 && /متبقي|رصيد|مبلغ الفاتورة|إضافي|اضافي/.test(texts.join(" "))) { current.notes.push(texts.join(" ")); continue; }
      if (label && amount === null && !dateRaw) { current.notes.push(label); continue; }
      // row with text but not a payment inside a block: might be a new heading → fallthrough
    }

    // Heading candidate: a text row with few non-empty cells and containing "/" or "حساب" or "مشروع"
    const joined = texts.filter(Boolean).join(" ");
    if (joined && toNumber(joined) === null) {
      if (current && !layout && /متبقي|رصيد|مبلغ الفاتورة|إضافي|اضافي/.test(joined)) { current.notes.push(joined); continue; }
      pendingHeading = { text: joined, row: i };
    }
  }
  return accounts;
}

export function parseCashboxWorkbook(path: string, fileLabel: string): RawAccount[] {
  const wb = XLSX.read(readFileSync(path), { type: "buffer", cellDates: false });
  const out: RawAccount[] = [];
  for (const sheet of wb.SheetNames) {
    const ws = wb.Sheets[sheet];
    const rows = XLSX.utils.sheet_to_json<Cell[]>(ws, { header: 1, blankrows: true, defval: "" });
    for (const slice of splitSideBySide(rows)) {
      out.push(...parseBlockRows(slice, fileLabel, sheet.trim()));
    }
  }
  return out;
}

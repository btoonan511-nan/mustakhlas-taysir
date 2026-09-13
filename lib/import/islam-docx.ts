import mammoth from "mammoth";
import { parse, HTMLElement } from "node-html-parser";
import { cleanText, toNumber } from "./cashbox";

export type RawCertItem = {
  seq: number | null;
  description: string;
  unit: string;
  prevQty: number | null;
  currentQty: number | null;
  totalQty: number | null;
  price: number | null;
  amount: number | null;
  note: string;
};

export type RawCertificate = {
  file: string;
  index: number; // position inside the file
  projectRaw: string;
  workTypeRaw: string;
  dateRaw: string;
  date: string | null;
  contractorRaw: string;
  phone: string;
  items: RawCertItem[];
  footer: { label: string; value: number | null }[];
  total: number | null;
  previousPaid: number | null;
  due: number | null;
  warnings: string[];
};

function isoFromArabicDate(t: string): string | null {
  const m = cleanText(t).match(/(\d{1,2})\s*\/\s*(\d{1,2})\s*\/\s*(\d{4})/);
  return m ? `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}` : null;
}

const dash = (t: string) => /^[-–—ـ\\]+$/.test(t) || t === "";
const FOOTER_RE = /إجمالي|اجمالي|الاجمالى|سبق|صرف|مطلوب|مستحق|صافي|ضريب|حسم|خصم|لحين|%|حتى تاريخه|قيمة الاعمال|قيمة الأعمال|دفعة مقدمة|مقدم/;

function parseTable(table: HTMLElement, cert: RawCertificate) {
  // expand colspan so merged cells occupy their slots
  const rows = table.querySelectorAll("tr").map((tr) => {
    const out: string[] = [];
    for (const td of tr.querySelectorAll("td,th")) {
      const span = Math.max(1, Number(td.getAttribute("colspan") ?? 1));
      const t = cleanText(td.text);
      for (let k = 0; k < span; k++) out.push(t);
    }
    return out;
  });

  // Islam's tables are stored right-to-left: document order is
  // [ملاحظات?, قيمة, السعر, جملة, حالي, سابق, الوحدة, بيان, م]. The notes cell is often
  // absent (merged), so every column is anchored from the END of the row.
  const headerIdx = rows.findIndex((r) => r.some((c) => /بيان الأعمال|بيان الاعمال/.test(c)));
  if (headerIdx < 0) { cert.warnings.push("جدول بدون صف عناوين"); return; }
  const sub = rows[headerIdx + 1] ?? [];
  const dataStart = headerIdx + (sub.some((c) => /سابق|حالي|جملة/.test(c)) ? 2 : 1);
  const num = (t: string | undefined) => (t === undefined || dash(t) ? null : toNumber(t));

  for (let i = dataStart; i < rows.length; i++) {
    const r = rows[i];
    const nonEmpty = r.filter((c) => !dash(c));
    if (nonEmpty.length === 0) continue;
    const distinct = [...new Set(nonEmpty)];
    const labelCell = distinct.find((c) => FOOTER_RE.test(c) && toNumber(c) === null);
    // footer rows are "label + number" (merged cells expand to repeated text)
    if (labelCell && distinct.length <= 3) {
      cert.footer.push({ label: labelCell, value: distinct.map(toNumber).find((n) => n !== null) ?? null });
      continue;
    }
    if (distinct.length === 1 && toNumber(distinct[0]) !== null) continue; // empty numbered row
    if (r.length < 8) { cert.warnings.push(`صف غير مفهوم: ${nonEmpty.join(" | ")}`); continue; }
    const L = r.length;
    const desc = r[L - 2] ?? "";
    if (!desc || dash(desc)) { if (nonEmpty.length > 1) cert.warnings.push(`صف بدون بيان: ${nonEmpty.join(" | ")}`); continue; }
    cert.items.push({
      seq: num(r[L - 1]),
      description: desc,
      unit: dash(r[L - 3] ?? "") ? "" : r[L - 3],
      prevQty: num(r[L - 4]),
      currentQty: num(r[L - 5]),
      totalQty: num(r[L - 6]),
      price: num(r[L - 7]),
      amount: num(r[L - 8]),
      note: L >= 9 ? r.slice(0, L - 8).filter((c) => !dash(c)).join(" ") : "",
    });
  }

  const pick = (re: RegExp) => cert.footer.find((f) => re.test(f.label))?.value ?? null;
  cert.total = pick(/إجمالي|اجمالي|الاجمالى|حتى تاريخه|قيمة الاعمال|قيمة الأعمال/);
  const withTax = cert.footer.find((f) => /مع الضريبة|بعد الضريبة/.test(f.label));
  if (withTax?.value != null) cert.total = withTax.value;
  cert.previousPaid = pick(/سبق|مقدم/);
  cert.due = pick(/مستحق|مطلوب|صافي/);
  if (cert.total === null) cert.total = cert.items.reduce((s, it) => s + (it.amount ?? 0), 0) || null;
}

export async function parseIslamDocx(path: string, fileLabel: string): Promise<RawCertificate[]> {
  const { value: html } = await mammoth.convertToHtml({ path });
  const root = parse(html);
  const certs: RawCertificate[] = [];
  let cur: RawCertificate | null = null;
  const fresh = (): RawCertificate => ({
    file: fileLabel, index: certs.length, projectRaw: "", workTypeRaw: "", dateRaw: "", date: null,
    contractorRaw: "", phone: "", items: [], footer: [], total: null, previousPaid: null, due: null, warnings: [],
  });
  for (const node of root.childNodes) {
    if (!(node instanceof HTMLElement)) continue;
    if (node.tagName === "TABLE") {
      if (!cur) { cur = fresh(); cur.warnings.push("جدول بدون ترويسة"); }
      parseTable(node, cur);
      certs.push(cur);
      cur = null;
      continue;
    }
    const t = cleanText(node.text);
    if (!t) continue;
    if (/^مشروع/.test(t)) { cur = fresh(); cur.projectRaw = t.replace(/^مشروع\s*/, "").trim(); continue; }
    if (/مستخلص\s*[اأ]عمال/.test(t)) {
      if (!cur) cur = fresh();
      const m = t.match(/مستخلص\s*[اأ]عمال\s*\/?\s*(.*?)\s*التـ*اريخ\s*:?\s*(.*)$/);
      if (m) { cur.workTypeRaw = cleanText(m[1]); cur.dateRaw = cleanText(m[2]); cur.date = isoFromArabicDate(m[2]); }
      else cur.workTypeRaw = t;
      continue;
    }
    if (/^المقاول/.test(t)) {
      if (!cur) cur = fresh();
      const m = t.match(/المقاول\s*\/?\s*(.*?)\s*جـ*وال\s*\/?\s*(.*)$/);
      if (m) { cur.contractorRaw = cleanText(m[1]); cur.phone = cleanText(m[2]).replace(/\D/g, ""); }
      else cur.contractorRaw = t.replace(/^المقاول\s*\/?\s*/, "");
      continue;
    }
  }
  if (cur && (cur.items.length || cur.contractorRaw)) certs.push(cur);
  return certs;
}

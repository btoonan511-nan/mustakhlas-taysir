import type { RawAccount } from "./cashbox";
import { normalizeArabic } from "./normalize";

export /** Merge continuation blocks (supplier monthly statements) inside one sheet and drop carry-forward rows. */
function mergeBlocks(accounts: RawAccount[]): RawAccount[] {
  const bySheet = new Map<string, RawAccount[]>();
  for (const a of accounts) {
    const list = bySheet.get(a.sheet) ?? [];
    list.push(a);
    bySheet.set(a.sheet, list);
  }
  const keyOf = (a: RawAccount) => normalizeArabic(a.headingRaw.replace(/الفواتير|\d+/g, ""));
  const out: RawAccount[] = [];
  for (const list of bySheet.values()) {
    const merged: RawAccount[] = [];
    for (const a of list) {
      const key = keyOf(a);
      const trivial = key.length < 3;
      // A block is a *continuation* of the previous one when its heading is trivial, or it carries a
      // "رصيد من شهر" balance row, or it's a supplier monthly statement with the same heading.
      const isContinuation = trivial || a.payments.some((p) => /^رصيد/.test(p.label)) || /الفواتير/.test(a.headingRaw);
      const sameHeading = merged.find((m) => keyOf(m) === key);
      const target = isContinuation ? (sameHeading ?? merged[merged.length - 1]) : undefined;
      const clean = a.payments.filter((p) => !/^رصيد/.test(p.label) && !/رصيد من شهر/.test(p.label));
      if (target) {
        // if the master block already balances with its declared total, the monthly re-listings are redundant
        const masterSum = target.payments.reduce((s, p) => s + p.amount, 0);
        if (target.declaredTotal !== null && Math.abs(target.declaredTotal - masterSum) <= 1) continue;
        const seen = new Set(target.payments.map((p) => `${p.date ?? p.dateRaw}|${p.amount}|${normalizeArabic(p.label)}`));
        for (const p of clean) {
          const k = `${p.date ?? p.dateRaw}|${p.amount}|${normalizeArabic(p.label)}`;
          if (!seen.has(k)) { target.payments.push(p); seen.add(k); }
        }
        if (a.status === "خالص") target.status = "خالص";
        target.notes.push(...a.notes);
      } else {
        merged.push({ ...a, payments: clean });
      }
    }
    out.push(...merged.filter((m) => m.payments.length > 0 || m.declaredTotal));
  }
  return out;
}

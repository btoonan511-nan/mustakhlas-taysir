import { asc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { normalizeArabic, canonicalWorkType } from "@/lib/import/normalize";
import type { RawCertItem } from "@/lib/import/islam-docx";

export type Candidate = { accountId: number; title: string; party: string; project: string; workType: string; paid: number; paidBefore: number; score: number; reasons: string[] };

export async function pendingLegacy() {
  return db.query.legacyCertificates.findMany({ where: eq(schema.legacyCertificates.status, "pending"), with: { project: true }, orderBy: [asc(schema.legacyCertificates.sourceFile), asc(schema.legacyCertificates.sourceIndex)] });
}

export async function allAccountsLite() {
  const rows = await db.query.accounts.findMany({ with: { party: true, project: true, workType: true, payments: { columns: { amount: true, date: true } }, items: { columns: { id: true } } } });
  return rows.map((a) => ({
    id: a.id, title: a.title, party: a.party.name, partyId: a.partyId, phone: a.party.phone, project: a.project.name, projectId: a.projectId,
    workType: a.workType?.name ?? "", paid: a.payments.reduce((s, p) => s + p.amount, 0), payments: a.payments, items: a.items.length, needsReview: a.needsReview, reviewNote: a.reviewNote, status: a.status,
  }));
}
export type AccountLite = Awaited<ReturnType<typeof allAccountsLite>>[number];

function tokens(s: string) { return new Set(normalizeArabic(s).split(" ").filter((t) => t.length >= 2)); }
function overlap(a: string, b: string) {
  const ta = tokens(a), tb = tokens(b);
  if (!ta.size || !tb.size) return 0;
  let hit = 0; for (const t of ta) if (tb.has(t)) hit++;
  return hit / Math.min(ta.size, tb.size);
}

/** Rank cashbox accounts as link candidates for a legacy certificate. */
export function candidates(cert: { projectId: number | null; contractorRaw: string; workTypeRaw: string; date: string | null; previousPaid: number | null; total: number | null }, accounts: AccountLite[]): Candidate[] {
  const wt = canonicalWorkType(cert.workTypeRaw);
  const out: Candidate[] = [];
  for (const a of accounts) {
    const reasons: string[] = [];
    let score = 0;
    const partySim = overlap(cert.contractorRaw, a.party) || overlap(cert.contractorRaw, a.title) * 0.8;
    if (partySim >= 0.99) { score += 50; reasons.push("نفس اسم المقاول"); }
    else if (partySim >= 0.5) { score += 30 * partySim; reasons.push("اسم مشابه"); }
    if (cert.projectId && a.projectId === cert.projectId) { score += 25; reasons.push("نفس المشروع"); }
    if (wt !== "أخرى" && a.workType === wt) { score += 15; reasons.push("نفس نوع العمل"); }
    else if (overlap(cert.workTypeRaw, a.title) >= 0.5) { score += 10; reasons.push("العنوان يذكر نوع العمل"); }
    const paidBefore = cert.date ? a.payments.filter((p) => p.date && p.date <= cert.date!).reduce((s, p) => s + p.amount, 0) : a.paid;
    if (cert.previousPaid && paidBefore > 0) {
      const diff = Math.abs(paidBefore - cert.previousPaid) / Math.max(cert.previousPaid, 1);
      if (diff <= 0.02) { score += 30; reasons.push("سبق صرفه يطابق الصندوق"); }
      else if (diff <= 0.15) { score += 12; reasons.push("سبق صرفه قريب من الصندوق"); }
    }
    if (score >= 25) out.push({ accountId: a.id, title: a.title, party: a.party, project: a.project, workType: a.workType, paid: a.paid, paidBefore, score, reasons });
  }
  return out.sort((x, y) => y.score - x.score).slice(0, 6);
}

export function legacyItems(cert: { items: unknown }): RawCertItem[] {
  return Array.isArray(cert.items) ? (cert.items as RawCertItem[]) : [];
}

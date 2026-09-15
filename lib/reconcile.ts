import { eq, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { normalizeArabic, canonicalWorkType } from "@/lib/import/normalize";
import { legacyItems } from "@/lib/queries/reconciliation";

/** Link a legacy certificate to an account: copy its items into the account and store it as an approved legacy certificate. */
export async function linkLegacyToAccount(legacyId: number, accountId: number) {
  const cert = await db.query.legacyCertificates.findFirst({ where: eq(schema.legacyCertificates.id, legacyId) });
  if (!cert || cert.status !== "pending") throw new Error("المستخلص غير موجود أو مربوط مسبقاً");
  const acc = await db.query.accounts.findFirst({ where: eq(schema.accounts.id, accountId), with: { items: true, payments: true, party: true } });
  if (!acc) throw new Error("الحساب غير موجود");

  const items = legacyItems(cert);
  const [{ max }] = await db.select({ max: sql<number>`coalesce(max(${schema.certificates.number}), 0)::int` }).from(schema.certificates).where(eq(schema.certificates.accountId, accountId));
  const number = (max ?? 0) + 1;
  const total = cert.total ?? items.reduce((sum, it) => sum + (it.amount ?? 0), 0);
  const previousPaid = cert.previousPaid ?? 0;
  const due = cert.due ?? total - previousPaid;
  const deductions = Math.max(0, total - previousPaid - due);
  const [c] = await db.insert(schema.certificates).values({
    accountId, number, date: cert.date ?? new Date().toISOString().slice(0, 10), status: "approved", source: "legacy", approvedAt: new Date(),
    total, previousPaid, deductions, due, legacyId: cert.id,
    notes: `مستورد من ${cert.sourceFile}` + (cert.dateRaw && !cert.date ? ` — تاريخ غير مقروء: ${cert.dateRaw}` : ""),
  }).returning({ id: schema.certificates.id });

  // match items to existing account items by normalized description, else create
  const existing = new Map(acc.items.filter((i) => i.active).map((i) => [normalizeArabic(i.description), i]));
  let sort = acc.items.reduce((m, i) => Math.max(m, i.sort), 0);
  const rows: (typeof schema.certificateItems.$inferInsert)[] = [];
  for (const [k, it] of items.entries()) {
    const totalQty = it.totalQty ?? (((it.prevQty ?? 0) + (it.currentQty ?? 0)) || (it.amount && it.price ? it.amount / it.price : 0));
    const price = it.price ?? (it.amount && totalQty ? it.amount / totalQty : 0);
    const amount = it.amount ?? totalQty * price;
    // a paper may list the same description twice (different locations) — keep them as separate items
    const seenInPaper = items.slice(0, k).some((o) => normalizeArabic(o.description) === normalizeArabic(it.description));
    const key = seenInPaper ? `${normalizeArabic(it.description)}#${k}` : normalizeArabic(it.description);
    let ai = existing.get(key);
    if (ai) {
      await db.update(schema.accountItems).set({ cumQty: totalQty, price, unit: it.unit || ai.unit }).where(eq(schema.accountItems.id, ai.id));
    } else {
      sort += 1;
      const [row] = await db.insert(schema.accountItems).values({ accountId, sort, description: it.description, unit: it.unit, price, cumQty: totalQty }).returning();
      ai = row; existing.set(key, row);
    }
    rows.push({ certificateId: c.id, accountItemId: ai.id, sort: k + 1, description: it.description, unit: it.unit, prevQty: it.prevQty ?? 0, currentQty: it.currentQty ?? 0, totalQty, price, amount, note: it.note ?? "" });
  }
  if (rows.length) await db.insert(schema.certificateItems).values(rows);

  // no cashbox payments for this account? carry Islam's "ما سبق صرفه" as an opening balance so totals stay honest
  if (acc.payments.length === 0 && previousPaid > 0) {
    await db.insert(schema.payments).values({ accountId, seq: 1, date: cert.date, amount: previousPaid, label: "رصيد سابق (من مستخلص إسلام — لا يوجد بالصندوق)", isOpening: true, note: cert.sourceFile });
  }
  if (!acc.party.phone && cert.phone) await db.update(schema.parties).set({ phone: cert.phone }).where(eq(schema.parties.id, acc.partyId));
  await db.update(schema.legacyCertificates).set({ status: "linked", linkedAccountId: accountId, linkedCertificateId: c.id }).where(eq(schema.legacyCertificates.id, legacyId));
  return c.id;
}

/** Create a new account (party + work type) from the legacy certificate's header, then link. */
export async function createAccountFromLegacy(legacyId: number, projectId: number, partyNameOverride?: string, category: "contractor" | "supplier" | "equipment" | "rental" | "other" = "contractor") {
  const cert = await db.query.legacyCertificates.findFirst({ where: eq(schema.legacyCertificates.id, legacyId) });
  if (!cert) throw new Error("غير موجود");
  const partyName = partyNameOverride?.trim() || cert.contractorRaw || "غير معروف";
  const all = await db.select().from(schema.parties);
  let party = all.find((p) => normalizeArabic(p.name) === normalizeArabic(partyName));
  if (!party) [party] = await db.insert(schema.parties).values({ name: partyName, phone: cert.phone, category }).returning();
  const wtName = canonicalWorkType(cert.workTypeRaw);
  let [wt] = await db.select().from(schema.workTypes).where(eq(schema.workTypes.name, wtName));
  if (!wt) [wt] = await db.insert(schema.workTypes).values({ name: wtName }).returning();
  const [acc] = await db.insert(schema.accounts).values({
    projectId, partyId: party.id, workTypeId: wt.id, title: `${party.name} / ${cert.workTypeRaw || wtName}`,
    notes: `أُنشئ من مستخلص إسلام (${cert.sourceFile})`, needsReview: true, reviewNote: "حساب بدون دفعات صندوق — أُنشئ من مستخلص إسلام",
  }).returning({ id: schema.accounts.id });
  await db.update(schema.legacyCertificates).set({ projectId }).where(eq(schema.legacyCertificates.id, legacyId));
  await linkLegacyToAccount(legacyId, acc.id);
  return acc.id;
}

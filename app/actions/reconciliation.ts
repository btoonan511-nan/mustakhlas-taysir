"use server";

import { revalidatePath } from "next/cache";
import { and, eq, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireAdmin } from "@/lib/auth";
import { normalizeArabic, canonicalWorkType } from "@/lib/import/normalize";
import { legacyItems } from "@/lib/queries/reconciliation";

const id = (fd: FormData, k: string) => { const v = Number(fd.get(k)); return Number.isFinite(v) && v > 0 ? v : null; };
const s = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();

function revalidateAll(accountId?: number) {
  revalidatePath("/reconciliation"); revalidatePath("/accounts"); revalidatePath("/"); revalidatePath("/certificates");
  if (accountId) revalidatePath(`/accounts/${accountId}`);
}

/** Link a legacy certificate to an account: copy its items into the account and store it as an approved legacy certificate. */
async function linkLegacyToAccount(legacyId: number, accountId: number) {
  const cert = await db.query.legacyCertificates.findFirst({ where: eq(schema.legacyCertificates.id, legacyId) });
  if (!cert || cert.status !== "pending") throw new Error("المستخلص غير موجود أو مربوط مسبقاً");
  const acc = await db.query.accounts.findFirst({ where: eq(schema.accounts.id, accountId), with: { items: true, payments: true, party: true } });
  if (!acc) throw new Error("الحساب غير موجود");

  const items = legacyItems(cert);
  const [{ max }] = await db.select({ max: sql<number>`coalesce(max(${schema.certificates.number}), 0)::int` }).from(schema.certificates).where(eq(schema.certificates.accountId, accountId));
  const number = (max ?? 0) + 1;
  const total = cert.total ?? items.reduce((sum, it) => sum + (it.amount ?? 0), 0);
  const previousPaid = cert.previousPaid ?? 0;
  const deductions = Math.max(0, total - previousPaid - (cert.due ?? total - previousPaid));
  const [c] = await db.insert(schema.certificates).values({
    accountId, number, date: cert.date ?? new Date().toISOString().slice(0, 10), status: "approved", source: "legacy", approvedAt: new Date(),
    total, previousPaid, deductions, due: cert.due ?? total - previousPaid, legacyId: cert.id,
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
    const key = normalizeArabic(it.description);
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
}

export async function linkLegacyAction(fd: FormData) {
  await requireAdmin();
  const legacyId = id(fd, "legacyId")!;
  const accountId = id(fd, "accountId");
  if (!accountId) throw new Error("اختر الحساب");
  await linkLegacyToAccount(legacyId, accountId);
  revalidateAll(accountId);
}

/** Create a new account (party + work type) from the legacy certificate's header, then link. */
export async function createAccountFromLegacyAction(fd: FormData) {
  await requireAdmin();
  const legacyId = id(fd, "legacyId")!;
  const projectId = id(fd, "projectId");
  if (!projectId) throw new Error("حدد المشروع أولاً");
  const cert = await db.query.legacyCertificates.findFirst({ where: eq(schema.legacyCertificates.id, legacyId) });
  if (!cert) throw new Error("غير موجود");
  const partyName = s(fd, "partyName") || cert.contractorRaw || "غير معروف";
  const all = await db.select().from(schema.parties);
  let party = all.find((p) => normalizeArabic(p.name) === normalizeArabic(partyName));
  if (!party) [party] = await db.insert(schema.parties).values({ name: partyName, phone: cert.phone, category: "contractor" }).returning();
  const wtName = canonicalWorkType(cert.workTypeRaw);
  let [wt] = await db.select().from(schema.workTypes).where(eq(schema.workTypes.name, wtName));
  if (!wt) [wt] = await db.insert(schema.workTypes).values({ name: wtName }).returning();
  const [acc] = await db.insert(schema.accounts).values({
    projectId, partyId: party.id, workTypeId: wt.id, title: `${party.name} / ${cert.workTypeRaw || wtName}`,
    notes: `أُنشئ من مستخلص إسلام (${cert.sourceFile})`, needsReview: true, reviewNote: "حساب بدون دفعات صندوق — أُنشئ من مستخلص إسلام",
  }).returning({ id: schema.accounts.id });
  await db.update(schema.legacyCertificates).set({ projectId }).where(eq(schema.legacyCertificates.id, legacyId));
  await linkLegacyToAccount(legacyId, acc.id);
  revalidateAll(acc.id);
}

export async function ignoreLegacyAction(fd: FormData) {
  await requireAdmin();
  await db.update(schema.legacyCertificates).set({ status: "ignored" }).where(eq(schema.legacyCertificates.id, id(fd, "legacyId")!));
  revalidateAll();
}

export async function restoreLegacyAction(fd: FormData) {
  await requireAdmin();
  await db.update(schema.legacyCertificates).set({ status: "pending" }).where(and(eq(schema.legacyCertificates.id, id(fd, "legacyId")!), eq(schema.legacyCertificates.status, "ignored")));
  revalidateAll();
}

export async function setLegacyProjectAction(fd: FormData) {
  await requireAdmin();
  await db.update(schema.legacyCertificates).set({ projectId: id(fd, "projectId") }).where(eq(schema.legacyCertificates.id, id(fd, "legacyId")!));
  revalidatePath("/reconciliation");
}

/** Quick fixes for flagged accounts: move project / clear flag. */
export async function resolveAccountAction(fd: FormData) {
  await requireAdmin();
  const accountId = id(fd, "accountId")!;
  const projectId = id(fd, "projectId");
  const partyId = id(fd, "partyId");
  const workTypeId = id(fd, "workTypeId");
  await db.update(schema.accounts).set({ ...(projectId ? { projectId } : {}), ...(partyId ? { partyId } : {}), ...(workTypeId ? { workTypeId } : {}), needsReview: fd.get("keep") === "on", reviewNote: fd.get("keep") === "on" ? s(fd, "reviewNote") : "" })
    .where(eq(schema.accounts.id, accountId));
  revalidateAll(accountId);
}

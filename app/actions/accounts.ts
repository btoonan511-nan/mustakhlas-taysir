"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireUser, requireAdmin } from "@/lib/auth";
import { canonicalWorkType } from "@/lib/import/normalize";

const s = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const n = (fd: FormData, k: string) => { const v = Number(String(fd.get(k) ?? "").replace(/[,٬\s]/g, "")); return Number.isFinite(v) ? v : 0; };
const id = (fd: FormData, k: string) => { const v = Number(fd.get(k)); return Number.isFinite(v) && v > 0 ? v : null; };

/** Find or create a party by name. */
async function ensureParty(name: string, phone: string, category: string) {
  const [existing] = await db.select().from(schema.parties).where(eq(schema.parties.name, name)).limit(1);
  if (existing) {
    if (phone && !existing.phone) await db.update(schema.parties).set({ phone }).where(eq(schema.parties.id, existing.id));
    return existing.id;
  }
  const [row] = await db.insert(schema.parties).values({ name, phone, category: (category || "contractor") as typeof schema.parties.category.enumValues[number] }).returning({ id: schema.parties.id });
  return row.id;
}

async function ensureWorkType(name: string) {
  const clean = name.trim() || "أخرى";
  const [existing] = await db.select().from(schema.workTypes).where(eq(schema.workTypes.name, clean)).limit(1);
  if (existing) return existing.id;
  const [row] = await db.insert(schema.workTypes).values({ name: clean }).returning({ id: schema.workTypes.id });
  return row.id;
}

export async function createAccountAction(fd: FormData) {
  await requireUser();
  const projectId = id(fd, "projectId");
  if (!projectId) throw new Error("اختر المشروع");
  const partyId = id(fd, "partyId") ?? (s(fd, "partyName") ? await ensureParty(s(fd, "partyName"), s(fd, "partyPhone"), s(fd, "partyCategory")) : null);
  if (!partyId) throw new Error("اختر الجهة أو أدخل اسمها");
  const workName = s(fd, "workTypeName") || canonicalWorkType(s(fd, "title"));
  const workTypeId = id(fd, "workTypeId") ?? await ensureWorkType(workName);
  const [party] = await db.select().from(schema.parties).where(eq(schema.parties.id, partyId));
  const [wt] = await db.select().from(schema.workTypes).where(eq(schema.workTypes.id, workTypeId));
  const title = s(fd, "title") || `${party.name} / ${wt.name}`;
  const [acc] = await db.insert(schema.accounts).values({ projectId, partyId, workTypeId, title, notes: s(fd, "notes") }).returning({ id: schema.accounts.id });
  revalidatePath("/accounts");
  const next = s(fd, "next");
  redirect(next === "certificate" ? `/certificates/new?account=${acc.id}` : `/accounts/${acc.id}`);
}

export async function updateAccountAction(fd: FormData) {
  await requireUser();
  const accountId = id(fd, "accountId")!;
  const partyId = id(fd, "partyId");
  const workTypeId = id(fd, "workTypeId");
  await db.update(schema.accounts).set({
    title: s(fd, "title"), projectId: id(fd, "projectId")!, ...(partyId ? { partyId } : {}), ...(workTypeId ? { workTypeId } : {}),
    status: s(fd, "status") === "closed" ? "closed" : "open",
    needsReview: fd.get("needsReview") === "on", reviewNote: s(fd, "reviewNote"), notes: s(fd, "notes"),
  }).where(eq(schema.accounts.id, accountId));
  revalidatePath(`/accounts/${accountId}`); revalidatePath("/accounts"); revalidatePath("/");
}

export async function deleteAccountAction(fd: FormData) {
  await requireAdmin();
  const accountId = id(fd, "accountId")!;
  await db.delete(schema.accounts).where(eq(schema.accounts.id, accountId));
  revalidatePath("/accounts"); revalidatePath("/");
  redirect("/accounts");
}

export async function addPaymentAction(fd: FormData) {
  await requireUser();
  const accountId = id(fd, "accountId")!;
  const amount = n(fd, "amount");
  if (!amount) throw new Error("أدخل المبلغ");
  const [{ max }] = await db.select({ max: schema.payments.seq }).from(schema.payments).where(eq(schema.payments.accountId, accountId)).orderBy(schema.payments.seq).limit(1000).then((rows) => [{ max: rows.reduce((m, r) => Math.max(m, r.max ?? 0), 0) }]);
  await db.insert(schema.payments).values({
    accountId, seq: max + 1, date: s(fd, "date") || null, amount, method: s(fd, "method"), voucher: s(fd, "voucher"),
    label: s(fd, "label") || `دفعة ${max + 1} من الحساب`, note: s(fd, "note"), source: s(fd, "source") === "islam" ? "islam" : "cashbox",
  });
  revalidatePath(`/accounts/${accountId}`); revalidatePath("/accounts"); revalidatePath("/");
  if (s(fd, "redirect")) redirect(`/accounts/${accountId}`);
}

export async function updatePaymentAction(fd: FormData) {
  await requireUser();
  const paymentId = id(fd, "paymentId")!;
  const accountId = id(fd, "accountId")!;
  await db.update(schema.payments).set({ date: s(fd, "date") || null, amount: n(fd, "amount"), method: s(fd, "method"), voucher: s(fd, "voucher"), label: s(fd, "label"), note: s(fd, "note"), source: s(fd, "source") === "islam" ? "islam" : "cashbox" })
    .where(eq(schema.payments.id, paymentId));
  revalidatePath(`/accounts/${accountId}`); revalidatePath("/");
}

export async function deletePaymentAction(fd: FormData) {
  await requireUser();
  const paymentId = id(fd, "paymentId")!;
  const accountId = id(fd, "accountId")!;
  await db.delete(schema.payments).where(eq(schema.payments.id, paymentId));
  revalidatePath(`/accounts/${accountId}`); revalidatePath("/accounts"); revalidatePath("/");
}

export async function addItemAction(fd: FormData) {
  await requireUser();
  const accountId = id(fd, "accountId")!;
  const description = s(fd, "description");
  if (!description) throw new Error("أدخل البيان");
  const rows = await db.select({ sort: schema.accountItems.sort }).from(schema.accountItems).where(eq(schema.accountItems.accountId, accountId));
  const sort = rows.reduce((m, r) => Math.max(m, r.sort), 0) + 1;
  await db.insert(schema.accountItems).values({ accountId, sort, description, unit: s(fd, "unit"), price: n(fd, "price"), cumQty: n(fd, "cumQty") });
  revalidatePath(`/accounts/${accountId}`);
}

export async function updateItemAction(fd: FormData) {
  await requireUser();
  const itemId = id(fd, "itemId")!;
  const accountId = id(fd, "accountId")!;
  await db.update(schema.accountItems).set({ description: s(fd, "description"), unit: s(fd, "unit"), price: n(fd, "price"), cumQty: n(fd, "cumQty") }).where(eq(schema.accountItems.id, itemId));
  revalidatePath(`/accounts/${accountId}`);
}

export async function deleteItemAction(fd: FormData) {
  await requireUser();
  const itemId = id(fd, "itemId")!;
  const accountId = id(fd, "accountId")!;
  await db.update(schema.accountItems).set({ active: false }).where(eq(schema.accountItems.id, itemId));
  revalidatePath(`/accounts/${accountId}`);
}

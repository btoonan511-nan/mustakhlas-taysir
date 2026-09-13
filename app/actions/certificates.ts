"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq, ne, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireUser, requireAdmin } from "@/lib/auth";

export type CertItemInput = {
  accountItemId: number | null;
  description: string;
  unit: string;
  prevQty: number;
  currentQty: number;
  price: number;
  note: string;
};

export type CertInput = {
  id?: number;
  accountId: number;
  date: string;
  notes: string;
  previousPaid: number;
  deductions: number;
  items: CertItemInput[];
};

const round2 = (n: number) => Math.round(n * 100) / 100;

async function nextNumber(accountId: number) {
  const [r] = await db.select({ max: sql<number>`coalesce(max(${schema.certificates.number}), 0)::int` }).from(schema.certificates).where(eq(schema.certificates.accountId, accountId));
  return (r?.max ?? 0) + 1;
}

export async function saveCertificateAction(input: CertInput) {
  const user = await requireUser();
  const items = input.items.filter((it) => it.description.trim());
  // Cumulative certificate (same as Islam's Word format): قيمة الأعمال = جملة × السعر,
  // الإجمالي = Σ القيم, المستحق = الإجمالي − ما سبق صرفه − الحسميات.
  const rows = items.map((it, i) => {
    const totalQty = round2(it.prevQty + it.currentQty);
    const amount = round2(totalQty * it.price);
    return { sort: i + 1, accountItemId: it.accountItemId, description: it.description.trim(), unit: it.unit.trim(), prevQty: it.prevQty, currentQty: it.currentQty, totalQty, price: it.price, amount, note: it.note.trim() };
  });
  const total = round2(rows.reduce((s, r) => s + r.amount, 0));
  const due = round2(total - input.previousPaid - input.deductions);

  let certId = input.id ?? 0;
  if (certId) {
    const [existing] = await db.select().from(schema.certificates).where(eq(schema.certificates.id, certId));
    if (!existing) throw new Error("المستخلص غير موجود");
    if (existing.status === "approved") throw new Error("لا يمكن تعديل مستخلص معتمد");
    await db.update(schema.certificates).set({ date: input.date, notes: input.notes, previousPaid: input.previousPaid, deductions: input.deductions, total, due })
      .where(eq(schema.certificates.id, certId));
    await db.delete(schema.certificateItems).where(eq(schema.certificateItems.certificateId, certId));
  } else {
    const [c] = await db.insert(schema.certificates).values({
      accountId: input.accountId, number: await nextNumber(input.accountId), date: input.date, notes: input.notes,
      previousPaid: input.previousPaid, deductions: input.deductions, total, due, createdBy: user.id,
    }).returning({ id: schema.certificates.id });
    certId = c.id;
  }
  // new items (no accountItemId) are created on the account so they show up next time
  for (const r of rows) {
    if (!r.accountItemId) {
      const [ai] = await db.insert(schema.accountItems).values({ accountId: input.accountId, sort: 1000 + r.sort, description: r.description, unit: r.unit, price: r.price, cumQty: r.prevQty }).returning({ id: schema.accountItems.id });
      r.accountItemId = ai.id;
    } else {
      // keep the price/unit on the account item in sync with the latest certificate
      await db.update(schema.accountItems).set({ price: r.price, unit: r.unit, description: r.description }).where(eq(schema.accountItems.id, r.accountItemId));
    }
  }
  if (rows.length) await db.insert(schema.certificateItems).values(rows.map((r) => ({ ...r, certificateId: certId })));
  revalidatePath(`/accounts/${input.accountId}`); revalidatePath("/certificates");
  redirect(`/certificates/${certId}`);
}

export async function approveCertificateAction(fd: FormData) {
  await requireUser();
  const certId = Number(fd.get("certificateId"));
  const cert = await db.query.certificates.findFirst({ where: eq(schema.certificates.id, certId), with: { items: true } });
  if (!cert) throw new Error("المستخلص غير موجود");
  if (cert.status === "approved") return;
  // any other approved certificate after this one? then cumulative quantities would be off — block.
  for (const it of cert.items) {
    if (it.accountItemId) await db.update(schema.accountItems).set({ cumQty: it.totalQty, price: it.price }).where(eq(schema.accountItems.id, it.accountItemId));
  }
  await db.update(schema.certificates).set({ status: "approved", approvedAt: new Date() }).where(eq(schema.certificates.id, certId));
  revalidatePath(`/certificates/${certId}`); revalidatePath(`/accounts/${cert.accountId}`); revalidatePath("/"); revalidatePath("/certificates");
}

export async function unapproveCertificateAction(fd: FormData) {
  await requireAdmin();
  const certId = Number(fd.get("certificateId"));
  const cert = await db.query.certificates.findFirst({ where: eq(schema.certificates.id, certId), with: { items: true } });
  if (!cert || cert.status !== "approved") return;
  const later = await db.select({ id: schema.certificates.id }).from(schema.certificates)
    .where(and(eq(schema.certificates.accountId, cert.accountId), eq(schema.certificates.status, "approved"), ne(schema.certificates.id, certId), sql`${schema.certificates.number} > ${cert.number}`));
  if (later.length) throw new Error("يوجد مستخلص معتمد بعده — ألغِ اعتماده أولاً");
  for (const it of cert.items) {
    if (it.accountItemId) await db.update(schema.accountItems).set({ cumQty: it.prevQty }).where(eq(schema.accountItems.id, it.accountItemId));
  }
  await db.update(schema.certificates).set({ status: "draft", approvedAt: null }).where(eq(schema.certificates.id, certId));
  revalidatePath(`/certificates/${certId}`); revalidatePath(`/accounts/${cert.accountId}`); revalidatePath("/");
}

export async function deleteCertificateAction(fd: FormData) {
  await requireUser();
  const certId = Number(fd.get("certificateId"));
  const [cert] = await db.select().from(schema.certificates).where(eq(schema.certificates.id, certId));
  if (!cert) return;
  if (cert.status === "approved") throw new Error("ألغِ الاعتماد أولاً");
  await db.delete(schema.certificates).where(eq(schema.certificates.id, certId));
  revalidatePath(`/accounts/${cert.accountId}`); revalidatePath("/certificates");
  redirect(`/accounts/${cert.accountId}`);
}

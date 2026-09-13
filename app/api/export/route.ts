import * as XLSX from "xlsx";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { getUser } from "@/lib/auth";
import { CATEGORY_LABEL } from "@/lib/format";

export async function GET(req: Request) {
  const user = await getUser();
  if (!user) return new Response("unauthorized", { status: 401 });
  const type = new URL(req.url).searchParams.get("type") ?? "payments";
  const { payments, accounts, parties, projects, workTypes, accountItems } = schema;

  let rows: Record<string, unknown>[] = [];
  let name = type;
  if (type === "payments") {
    const r = await db.select().from(payments).innerJoin(accounts, eq(payments.accountId, accounts.id)).innerJoin(parties, eq(accounts.partyId, parties.id)).innerJoin(projects, eq(accounts.projectId, projects.id)).leftJoin(workTypes, eq(accounts.workTypeId, workTypes.id)).orderBy(projects.name, parties.name, accounts.id, payments.date);
    rows = r.map((x) => ({ "المشروع": x.projects.name, "الجهة": x.parties.name, "التصنيف": CATEGORY_LABEL[x.parties.category], "نوع العمل": x.work_types?.name ?? "", "الحساب": x.accounts.title, "م": x.payments.seq, "البيان": x.payments.label, "التاريخ": x.payments.date ?? x.payments.dateRaw, "المبلغ": x.payments.amount, "طريقة الدفع": x.payments.method, "رقم السند": x.payments.voucher, "ملاحظة": x.payments.note }));
    name = "الدفعات";
  } else if (type === "accounts") {
    const r = await db.query.accounts.findMany({ with: { project: true, party: true, workType: true, payments: { columns: { amount: true } }, items: { columns: { cumQty: true, price: true, active: true } } } });
    rows = r.map((a) => ({ "المشروع": a.project.name, "الجهة": a.party.name, "الجوال": a.party.phone, "التصنيف": CATEGORY_LABEL[a.party.category], "نوع العمل": a.workType?.name ?? "", "الحساب": a.title, "الحالة": a.status === "closed" ? "خالص" : "جاري", "عدد الدفعات": a.payments.length, "المصروف": a.payments.reduce((s, p) => s + p.amount, 0), "قيمة الأعمال": a.items.filter((i) => i.active).reduce((s, i) => s + i.cumQty * i.price, 0), "يحتاج مراجعة": a.needsReview ? "نعم" : "", "ملاحظة": a.reviewNote }));
    name = "الحسابات";
  } else {
    const r = await db.select().from(accountItems).innerJoin(accounts, eq(accountItems.accountId, accounts.id)).innerJoin(parties, eq(accounts.partyId, parties.id)).innerJoin(projects, eq(accounts.projectId, projects.id)).where(eq(accountItems.active, true)).orderBy(projects.name, parties.name, accounts.id, accountItems.sort);
    rows = r.map((x) => ({ "المشروع": x.projects.name, "الجهة": x.parties.name, "الحساب": x.accounts.title, "البند": x.account_items.description, "الوحدة": x.account_items.unit, "السعر": x.account_items.price, "الكمية المعتمدة": x.account_items.cumQty, "القيمة": x.account_items.cumQty * x.account_items.price }));
    name = "بنود الأعمال";
  }
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, name);
  wb.Workbook = { Views: [{ RTL: true }] };
  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
  return new Response(new Uint8Array(buf), { headers: { "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "content-disposition": `attachment; filename*=UTF-8''${encodeURIComponent(name)}.xlsx` } });
}

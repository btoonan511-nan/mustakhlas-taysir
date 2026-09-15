import "dotenv/config";
import { sql } from "drizzle-orm";
import { db } from "../db";

/** Data-integrity checks — run any time; prints problems only. */
async function main() {
  const q = async <T,>(s: ReturnType<typeof sql>) => (await db.execute(s)).rows as T[];
  const problems: string[] = [];

  const [tot] = await q<{ n: number; sum: number }>(sql`select count(*)::int n, coalesce(sum(amount),0)::float sum from payments`);
  const [acc] = await q<{ n: number; orphan: number }>(sql`select count(*)::int n, count(*) filter (where party_id is null or project_id is null)::int orphan from accounts`);
  const bad = await q<{ n: number }>(sql`select count(*)::int n from payments where date is null`);
  const future = await q<{ n: number }>(sql`select count(*)::int n from payments where date > current_date + 30`);
  const neg = await q<{ n: number }>(sql`select count(*)::int n from payments where amount <= 0`);
  const dupPay = await q<{ n: number }>(sql`select count(*)::int n from (select account_id, date, amount, label, count(*) c from payments group by 1,2,3,4 having count(*) > 1) d`);
  // account_items.cum_qty must equal the latest approved certificate's total_qty for that item
  const cumMismatch = await q<{ n: number }>(sql`
    with latest as (
      select distinct on (ci.account_item_id) ci.account_item_id, ci.total_qty
      from certificate_items ci join certificates c on c.id = ci.certificate_id
      where c.status = 'approved' and ci.account_item_id is not null
      order by ci.account_item_id, c.number desc, c.id desc)
    select count(*)::int n from latest l join account_items ai on ai.id = l.account_item_id where abs(ai.cum_qty - l.total_qty) > 0.001`);
  // certificate totals must equal the sum of their items
  const certMismatch = await q<{ id: number; total: number; items: number }>(sql`
    select c.id, c.total::float total, coalesce(sum(ci.amount),0)::float items from certificates c left join certificate_items ci on ci.certificate_id = c.id
    group by c.id, c.total having abs(c.total - coalesce(sum(ci.amount),0)) > 1`);
  const legacy = await q<{ status: string; n: number }>(sql`select status, count(*)::int n from legacy_certificates group by status`);
  const dupParties = await q<{ a: string; b: string }>(sql`
    select p1.name a, p2.name b from parties p1 join parties p2 on p1.id < p2.id
    where regexp_replace(lower(p1.name), '[^ء-ي]', '', 'g') = regexp_replace(lower(p2.name), '[^ء-ي]', '', 'g')`);

  console.log(`الدفعات: ${tot.n} — ${tot.sum.toLocaleString("en")} ر.س | الحسابات: ${acc.n}`);
  console.log("مستخلصات إسلام:", legacy.map((l) => `${l.status}=${l.n}`).join("  "));
  if (acc.orphan) problems.push(`${acc.orphan} حساب بدون جهة/مشروع`);
  if (bad[0].n) problems.push(`${bad[0].n} دفعة بتاريخ غير مقروء (تظهر باللون الأحمر في صفحة الحساب)`);
  if (future[0].n) problems.push(`${future[0].n} دفعة بتاريخ مستقبلي (خطأ إدخال في الصندوق، مثل 2028)`);
  if (neg[0].n) problems.push(`${neg[0].n} دفعة بمبلغ صفر/سالب`);
  if (dupPay[0].n) problems.push(`${dupPay[0].n} دفعة مكررة (نفس الحساب والتاريخ والمبلغ والبيان)`);
  if (cumMismatch[0].n) problems.push(`${cumMismatch[0].n} بند كميته التراكمية لا تطابق آخر مستخلص معتمد`);
  if (certMismatch.length) problems.push(`${certMismatch.length} مستخلص إجماليه ≠ مجموع بنوده (ضريبة/استقطاع قديم): ${certMismatch.map((c) => `#${c.id}`).join(" ")}`);
  if (dupParties.length) problems.push(`جهات متشابهة الاسم: ${dupParties.map((d) => `${d.a}≈${d.b}`).join("، ")}`);

  console.log(problems.length ? "\n⚠ ملاحظات:\n  • " + problems.join("\n  • ") : "\n✅ لا توجد مشاكل في البيانات");
}
main();

import "dotenv/config";
import { sql } from "drizzle-orm";
import { db } from "../db";

/** The cashbox is the only source of spending. Remove the "opening balance" rows that were copied from
 *  Islam's papers, and flag those accounts so their real cashbox rows get added when the missing sheets arrive. */
async function main() {
  const rows = (await db.execute(sql`
    select p.account_id, a.title, pr.name project, p.amount::float amount from payments p
    join accounts a on a.id = p.account_id join projects pr on pr.id = a.project_id where p.is_opening`)).rows as { account_id: number; title: string; project: string; amount: number }[];
  for (const r of rows) {
    await db.execute(sql`update accounts set needs_review = true,
      review_note = ${`ورقة إسلام تقول سبق صرفه ${r.amount.toLocaleString("en")} ولا توجد دفعات لهذا الحساب في ملفات الصندوق الحالية — أضف دفعاته عند وصول ورقته`}
      where id = ${r.account_id}`);
    console.log(`#${r.account_id} [${r.project}] ${r.title}: ${r.amount.toLocaleString("en")}`);
  }
  const del = await db.execute(sql`delete from payments where is_opening returning id`);
  const [t] = (await db.execute(sql`select coalesce(sum(amount),0)::float s from payments`)).rows as { s: number }[];
  console.log(`removed ${del.rows.length} opening rows; grand total now ${t.s.toLocaleString("en")}`);
}
main();

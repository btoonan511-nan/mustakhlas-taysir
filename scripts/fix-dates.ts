import "dotenv/config";
import { sql } from "drizzle-orm";
import { db } from "../db";

/** Account #11 ("السيد", الشقق) holds deductions ("خصم من …") that recover the material costs in account #10,
 *  not cash payments. Store them as negative amounts so they net out instead of double-counting 248,859. */
async function main() {
  const r = await db.execute(sql`
    update payments set amount = -abs(amount), method = 'خصم'
    where account_id = 11 and label like 'خصم%' and amount > 0 returning id, amount::float amount`);
  console.log("negated:", r.rows.length);
  await db.execute(sql`
    update accounts set title = 'خصومات السيد مقابل مواد الصبة (ليست صرفاً)', needs_review = true,
      review_note = 'خصومات من مستحقات السيد تقابل مواد الصبة في الحساب رقم 10 — مسجلة بالسالب حتى لا تُحسب كصرف. تأكد مع إسلام أن دفعات الحساب رقم 9 هي المبالغ النقدية الفعلية'
    where id = 11`);
  const t = (await db.execute(sql`select coalesce(sum(amount),0)::float s from payments`)).rows[0];
  console.log("new grand total:", t);
}
main();

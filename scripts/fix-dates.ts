import "dotenv/config";
import { sql } from "drizzle-orm";
import { db } from "../db";

/** Clear purely informational review flags (accounts created from Islam's papers, and the 5,000 note on المليس). */
async function main() {
  const r1 = await db.execute(sql`
    update accounts set needs_review = false, notes = trim(both ' | ' from notes || ' | ' || review_note), review_note = ''
    where needs_review and review_note like 'حساب بدون دفعات صندوق%' returning id`);
  const r2 = await db.execute(sql`
    update accounts set needs_review = false, notes = trim(both ' | ' from notes || ' | ملاحظة الاستيراد: ' || review_note), review_note = ''
    where id = 14 returning id`);
  console.log("cleared:", r1.rows.length + r2.rows.length);
  const left = (await db.execute(sql`select id, title from accounts where needs_review`)).rows;
  console.log("still flagged:", left);
}
main();

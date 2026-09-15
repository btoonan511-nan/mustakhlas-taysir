import "dotenv/config";
import { sql } from "drizzle-orm";
import { db } from "../db";

async function main() {
  const rows = (await db.execute(sql`
    select a.id, a.title, pr.name project, p.date::text d, p.amount::float amt, p.label
    from payments p join accounts a on a.id = p.account_id join projects pr on pr.id = a.project_id
    where (p.label ~ 'خصم|حسم|مرتجع|استرجاع|رصيد|فاتور' or p.method ~ 'فاتور') and p.amount > 0
    order by a.id, p.seq`)).rows as { id: number; title: string; project: string; d: string; amt: number; label: string }[];
  console.log(rows.length, "rows");
  for (const r of rows) console.log(`#${r.id} [${r.project}] ${r.title} | ${r.d ?? "—"} | ${r.amt} | ${r.label}`);
}
main();

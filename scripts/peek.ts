import "dotenv/config";
import { sql } from "drizzle-orm";
import { db } from "../db";

async function main() {
  const dup = (await db.execute(sql`select id, description, prev_qty::float prev, current_qty::float cur, total_qty::float tot, price::float, amount::float from certificate_items where certificate_id = 46 order by sort`)).rows;
  console.log(JSON.stringify(dup));
  const t = (await db.execute(sql`
    select
      coalesce(sum(amount) filter (where not is_opening and amount > 0), 0)::float cashbox_positive,
      coalesce(sum(amount) filter (where not is_opening and amount < 0), 0)::float deductions,
      coalesce(sum(amount) filter (where is_opening), 0)::float opening_from_islam,
      coalesce(sum(amount), 0)::float grand,
      count(*) filter (where not is_opening)::int n_cashbox, count(*) filter (where is_opening)::int n_opening
    from payments`)).rows[0];
  console.log(JSON.stringify(t, null, 1));
  const byProject = (await db.execute(sql`
    select pr.name, coalesce(sum(p.amount) filter (where not p.is_opening),0)::float cashbox, coalesce(sum(p.amount) filter (where p.is_opening),0)::float opening
    from payments p join accounts a on a.id = p.account_id join projects pr on pr.id = a.project_id group by pr.name order by cashbox desc`)).rows;
  console.log(JSON.stringify(byProject, null, 1));
}
main();

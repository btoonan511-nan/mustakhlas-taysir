import "dotenv/config";
import { sql } from "drizzle-orm";
import { db, schema } from "../db";

async function main() {
  const q = db.select({ id: schema.projects.id, name: schema.projects.name, accounts: sql<number>`(select count(*) from accounts a where a.project_id = ${schema.projects.id})::int` }).from(schema.projects);
  console.log(q.toSQL());
  console.log(await q);
}
main();

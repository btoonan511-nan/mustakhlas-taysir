import "dotenv/config";
import { eq, sql } from "drizzle-orm";
import { db, schema } from "../db";

/** Paper 34 (عامر / بلاط بيت ممدوح) lists «وزره» twice (house 122 m, استراحة 147 m); both rows were mapped to one account item. Split them. */
async function main() {
  const [acc] = await db.select({ accountId: schema.accountItems.accountId }).from(schema.accountItems).where(eq(schema.accountItems.id, 198));
  const [row] = await db.insert(schema.accountItems).values({ accountId: acc.accountId, sort: 99, description: "وزره (الاستراحة)", unit: "م/ط", price: 5, cumQty: 147 }).returning({ id: schema.accountItems.id });
  await db.update(schema.certificateItems).set({ accountItemId: row.id, description: "وزره (الاستراحة)" }).where(eq(schema.certificateItems.id, 204));
  await db.update(schema.accountItems).set({ cumQty: 122 }).where(eq(schema.accountItems.id, 198));
  const check = (await db.execute(sql`select id, description, cum_qty::float from account_items where account_id = ${acc.accountId} and description like 'وزره%'`)).rows;
  console.log(check);
}
main();

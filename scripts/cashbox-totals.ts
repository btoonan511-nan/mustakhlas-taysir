import "dotenv/config";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { sql } from "drizzle-orm";
import { db } from "../db";
import { parseCashboxWorkbook } from "../lib/import/cashbox";
import { mergeBlocks } from "../lib/import/merge";

/** Totals straight from the Drive Excel files (nothing from the dashboard), compared with what the site holds. */
async function main() {
  const dir = join(process.cwd(), "data/raw/cashbox");
  let grandRows = 0, grandDeclared = 0;
  const perFile: { file: string; accounts: number; rows: number; declared: number }[] = [];
  for (const file of readdirSync(dir)) {
    const blocks = mergeBlocks(parseCashboxWorkbook(join(dir, file), file));
    const rows = blocks.reduce((s, b) => s + b.payments.reduce((x, p) => x + p.amount, 0), 0);
    // what the sheet itself writes in its "الإجمالي" rows (falls back to the row sum when a block has no total row)
    const declared = blocks.reduce((s, b) => s + (b.declaredTotal ?? b.payments.reduce((x, p) => x + p.amount, 0)), 0);
    perFile.push({ file: file.normalize("NFC"), accounts: blocks.length, rows, declared });
    grandRows += rows; grandDeclared += declared;
  }
  const fmt = (n: number) => n.toLocaleString("en", { maximumFractionDigits: 0 });
  console.log("من ملفات الصندوق (Drive):");
  for (const f of perFile) console.log(`  ${f.file.padEnd(22)} ${String(f.accounts).padStart(3)} حساب   مجموع الصفوف ${fmt(f.rows).padStart(12)}   إجمالي الورقة ${fmt(f.declared).padStart(12)}`);
  console.log(`  ${"المجموع".padEnd(22)}                   ${fmt(grandRows).padStart(12)}                  ${fmt(grandDeclared).padStart(12)}`);

  const t = (await db.execute(sql`
    select coalesce(sum(amount) filter (where source = 'cashbox' and amount > 0),0)::float cashbox,
           coalesce(sum(amount) filter (where amount < 0),0)::float deductions,
           coalesce(sum(amount) filter (where source = 'islam'),0)::float opening
    from payments`)).rows[0] as { cashbox: number; deductions: number; opening: number };
  console.log("\nفي الموقع:");
  console.log(`  دفعات الصندوق (موجبة)        ${fmt(t.cashbox)}`);
  console.log(`  خصومات (بالسالب)              ${fmt(t.deductions)}`);
  console.log(`  مصروف من إسلام مباشرة       ${fmt(t.opening)}`);
  console.log(`  الإجمالي في لوحة التحليل       ${fmt(t.cashbox + t.deductions + t.opening)}`);
}
main();

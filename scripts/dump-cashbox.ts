import { readdirSync } from "node:fs";
import { join } from "node:path";
import { parseCashboxWorkbook } from "../lib/import/cashbox";

const dir = join(process.cwd(), "data/raw/cashbox");
let grand = 0, count = 0;
for (const file of readdirSync(dir)) {
  const accounts = parseCashboxWorkbook(join(dir, file), file);
  console.log(`\n=== ${file}: ${accounts.length} accounts`);
  for (const a of accounts) {
    const sum = a.payments.reduce((s, p) => s + p.amount, 0);
    const badDates = a.payments.filter((p) => !p.date).length;
    const flag = a.declaredTotal !== null && Math.abs(a.declaredTotal - sum) > 1 ? ` ⚠ declared ${a.declaredTotal}` : "";
    console.log(`  [${a.sheet}] ${a.headingRaw.slice(0, 70)} | n=${a.payments.length} sum=${sum}${flag}${badDates ? ` badDates=${badDates}` : ""}${a.status ? " " + a.status : ""}`);
    grand += sum; count += a.payments.length;
  }
}
console.log(`\nTOTAL payments=${count} sum=${grand}`);

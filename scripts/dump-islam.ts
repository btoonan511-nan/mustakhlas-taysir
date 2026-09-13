import { readdirSync } from "node:fs";
import { join } from "node:path";
import { parseIslamDocx } from "../lib/import/islam-docx";

async function main() {
  const dir = join(process.cwd(), "data/raw/islam");
  let n = 0;
  for (const file of readdirSync(dir)) {
    const certs = await parseIslamDocx(join(dir, file), file);
    console.log(`\n=== ${file}: ${certs.length} certificates`);
    for (const c of certs) {
      n++;
      const sumItems = c.items.reduce((s, i) => s + (i.amount ?? 0), 0);
      console.log(`  #${c.index} ${c.projectRaw} | ${c.workTypeRaw} | ${c.date ?? c.dateRaw} | ${c.contractorRaw} ${c.phone} | items=${c.items.length} sumItems=${sumItems} total=${c.total} prev=${c.previousPaid} due=${c.due}`);
      if (process.argv[2] === "items") for (const it of c.items) console.log(`       - ${it.description} [${it.unit}] prev=${it.prevQty} cur=${it.currentQty} tot=${it.totalQty} price=${it.price} amt=${it.amount}`);
      if (process.argv[2] === "footer") console.log("       footer:", c.footer.map((f) => `${f.label}=${f.value}`).join(" ; "));
      for (const w of c.warnings) console.log(`       WARN ${w}`);
    }
  }
  console.log(`\nTOTAL certificates=${n}`);
}
main();

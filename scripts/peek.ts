import * as XLSX from "xlsx";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

// grep the raw cashbox workbooks (every cell, every sheet) for the contractors whose payments the site could not find
const needles = ["ركن", "هواي", "كازا", "مكيف", "تكييف", "تكيف", "خيري", "سقال", "عبد الرحمن", "طباعة", "أبو سليم", "ابو سليم", "نجار", "أبو العز", "ابو العز", "عزل", "أيمن", "ايمن", "ناصر سيد", "احمد", "نظافة", "تنظيف"];
const dir = join(process.cwd(), "data/raw/cashbox");
for (const file of readdirSync(dir)) {
  const wb = XLSX.read(readFileSync(join(dir, file)), { type: "buffer" });
  for (const name of wb.SheetNames) {
    const rows = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[name], { header: 1, blankrows: false, defval: "" });
    for (const r of rows) {
      const line = r.map(String).join(" | ");
      const hit = needles.filter((n) => line.includes(n));
      if (hit.length && !/الدفعات/.test(line)) console.log(`${file.normalize("NFC")} › ${name} :: ${line.slice(0, 140)}`);
    }
  }
}

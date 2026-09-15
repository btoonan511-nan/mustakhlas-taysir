import * as XLSX from "xlsx";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const dir = join(process.cwd(), "data/raw/cashbox");
const file = readdirSync(dir).find((f) => f.normalize("NFC").includes("الشقق"))!;
const wb = XLSX.read(readFileSync(join(dir, file)), { type: "buffer" });
const ws = wb.Sheets["ضوء وقطرة"];
const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, blankrows: false, defval: "" });
for (const r of rows) console.log(JSON.stringify(r));

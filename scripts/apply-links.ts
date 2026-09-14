import "dotenv/config";
import { eq, ilike, and } from "drizzle-orm";
import { db, schema } from "../db";
import { linkLegacyToAccount, createAccountFromLegacy } from "../lib/reconcile";

/** legacyId → accountId (confident matches: same contractor + project + work type and/or "سبق صرفه" equals cashbox). */
const LINKS: Record<number, number> = {
  3: 31, 4: 118, 5: 14, 8: 20, 9: 121, 15: 95, 16: 131, 18: 118, 20: 15, 21: 94, 23: 13, 24: 65,
  25: 135, 26: 18, 27: 130, 29: 19, 30: 19, 31: 38, 33: 132, 35: 52, 37: 12, 40: 75, 41: 87, 42: 48,
};
/** legacyId → [project, party name, category] for certificates that have no cashbox account. */
const CREATE: Record<number, [string, string, "contractor" | "supplier"]> = {
  6: ["الجنوب", "ناصر سيد", "contractor"],
  10: ["الشقق السكنية", "أيمن الشقق", "contractor"],
  11: ["أسواق الحسون", "عبد الرحمن", "contractor"],
  12: ["الشقق السكنية", "ركن هواي", "supplier"],
  13: ["الشقق السكنية", "كازا", "contractor"],
  14: ["أسواق الحسون", "كازا", "contractor"],
  22: ["استراحة أبو محمد", "كازا", "contractor"],
  43: ["أسواق الحسون", "خيري", "contractor"],
  44: ["الجنوب", "خيري", "contractor"],
  45: ["استراحة أبو محمد", "خيري", "contractor"],
  46: ["بيت ممدوح", "أبو العز", "contractor"],
  47: ["أسواق الحسون", "أبو العز", "contractor"],
  50: ["بيت ممدوح", "أبو سليم", "contractor"],
  51: ["بيت ممدوح", "احمد", "contractor"],
};

async function main() {
  const projects = await db.select().from(schema.projects);
  const pid = (name: string) => { const p = projects.find((x) => x.name === name); if (!p) throw new Error("project " + name); return p.id; };

  // cert 2: عبد الخالق / انترلوك → cashbox "عبدالخالق / بلاط بيت ممدوح"
  const [khaliq] = await db.select({ id: schema.accounts.id }).from(schema.accounts).innerJoin(schema.parties, eq(schema.accounts.partyId, schema.parties.id))
    .where(and(ilike(schema.parties.name, "%عبدالخالق%"), eq(schema.accounts.projectId, pid("بيت ممدوح"))));
  if (khaliq) LINKS[2] = khaliq.id;

  for (const [legacyId, accountId] of Object.entries(LINKS)) {
    try { const c = await linkLegacyToAccount(Number(legacyId), accountId); console.log(`✅ ربط ${legacyId} → حساب ${accountId} (مستخلص ${c})`); }
    catch (e) { console.log(`⚠ ${legacyId}: ${(e as Error).message}`); }
  }
  for (const [legacyId, [project, party, category]] of Object.entries(CREATE)) {
    try { const a = await createAccountFromLegacy(Number(legacyId), pid(project), party, category); console.log(`🆕 ${legacyId} → حساب جديد ${a} (${party} / ${project})`); }
    catch (e) { console.log(`⚠ ${legacyId}: ${(e as Error).message}`); }
  }
  const left = await db.select({ id: schema.legacyCertificates.id, c: schema.legacyCertificates.contractorRaw, w: schema.legacyCertificates.workTypeRaw, p: schema.legacyCertificates.projectRaw }).from(schema.legacyCertificates).where(eq(schema.legacyCertificates.status, "pending"));
  console.log(`\nمتبقي بانتظار قرارك: ${left.length}`);
  for (const l of left) console.log(`  [${l.id}] ${l.c} | ${l.w} | ${l.p}`);
}
main();

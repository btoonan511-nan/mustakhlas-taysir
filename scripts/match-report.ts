import "dotenv/config";
import { pendingLegacy, allAccountsLite, candidates } from "../lib/queries/reconciliation";
import { money } from "../lib/format";

async function main() {
  const [pending, accounts] = await Promise.all([pendingLegacy(), allAccountsLite()]);
  let sure = 0, unsure = 0;
  for (const c of pending) {
    const cands = candidates({ projectId: c.projectId, contractorRaw: c.contractorRaw, workTypeRaw: c.workTypeRaw, date: c.date, previousPaid: c.previousPaid, total: c.total }, accounts);
    const top = cands[0];
    const second = cands[1];
    const confident = top && top.score >= 85 && top.reasons.includes("نفس اسم المقاول") && top.reasons.includes("نفس المشروع") && (!second || second.score < top.score);
    if (confident) sure++; else unsure++;
    console.log(`\n[${c.id}] ${confident ? "✅" : "❓"} ${c.contractorRaw} | ${c.workTypeRaw} | ${c.project?.name ?? "؟ " + c.projectRaw} | ${c.date} | total=${money(c.total)} prev=${money(c.previousPaid)}`);
    for (const k of cands.slice(0, 3)) console.log(`     ${k.score.toFixed(0).padStart(3)}  #${k.accountId} ${k.party} — ${k.title} [${k.project}/${k.workType}] paid=${money(k.paid)} before=${money(k.paidBefore)} :: ${k.reasons.join("، ")}`);
  }
  console.log(`\nمؤكد: ${sure}  غير مؤكد: ${unsure}`);
}
main();

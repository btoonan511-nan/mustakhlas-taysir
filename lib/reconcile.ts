import { eq, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { normalizeArabic, canonicalWorkType } from "@/lib/import/normalize";
import { legacyItems } from "@/lib/queries/reconciliation";

/** Link one of Islam's old papers to a cashbox account: copy its item descriptions/quantities onto the account.
 *  Money is never taken from the paper — the cashbox is the only source of spending. */
export async function linkLegacyToAccount(legacyId: number, accountId: number) {
  const cert = await db.query.legacyCertificates.findFirst({ where: eq(schema.legacyCertificates.id, legacyId) });
  if (!cert || cert.status !== "pending") throw new Error("المستخلص غير موجود أو مربوط مسبقاً");
  const acc = await db.query.accounts.findFirst({ where: eq(schema.accounts.id, accountId), with: { items: true, payments: true, party: true } });
  if (!acc) throw new Error("الحساب غير موجود");

  const items = legacyItems(cert);

  // match items to existing account items by normalized description, else create
  const existing = new Map(acc.items.filter((i) => i.active).map((i) => [normalizeArabic(i.description), i]));
  let sort = acc.items.reduce((m, i) => Math.max(m, i.sort), 0);
  for (const [k, it] of items.entries()) {
    const totalQty = it.totalQty ?? (((it.prevQty ?? 0) + (it.currentQty ?? 0)) || (it.amount && it.price ? it.amount / it.price : 0));
    const price = it.price ?? (it.amount && totalQty ? it.amount / totalQty : 0);
    // a paper may list the same description twice (different locations) — keep them as separate items
    const seenInPaper = items.slice(0, k).some((o) => normalizeArabic(o.description) === normalizeArabic(it.description));
    const key = seenInPaper ? `${normalizeArabic(it.description)}#${k}` : normalizeArabic(it.description);
    let ai = existing.get(key);
    if (ai) {
      await db.update(schema.accountItems).set({ cumQty: totalQty, price, unit: it.unit || ai.unit }).where(eq(schema.accountItems.id, ai.id));
    } else {
      sort += 1;
      const [row] = await db.insert(schema.accountItems).values({ accountId, sort, description: it.description, unit: it.unit, price, cumQty: totalQty }).returning();
      ai = row; existing.set(key, row);
    }
  }

  if (!acc.party.phone && cert.phone) await db.update(schema.parties).set({ phone: cert.phone }).where(eq(schema.parties.id, acc.partyId));
  await db.update(schema.legacyCertificates).set({ status: "linked", linkedAccountId: accountId, linkedCertificateId: null }).where(eq(schema.legacyCertificates.id, legacyId));
  return accountId;
}

/** Accounts are only ever created from cashbox sheets (or by hand). A paper without a cashbox account waits. */
export async function createAccountFromLegacy(): Promise<number> {
  throw new Error("الحسابات تُنشأ من أوراق الصندوق فقط — أجّل هذه الورقة حتى تصل ورقة صندوقها");
}

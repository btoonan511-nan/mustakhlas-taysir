import { and, asc, desc, eq, ilike, or, sql, type SQL } from "drizzle-orm";
import { db, schema } from "@/db";

const { accounts, parties, projects, workTypes, payments, certificates, accountItems } = schema;

export type AccountFilters = { q?: string; projectId?: number; partyId?: number; workTypeId?: number; category?: string; status?: string; review?: boolean };

export async function listAccounts(f: AccountFilters) {
  const conds: SQL[] = [];
  if (f.projectId) conds.push(eq(accounts.projectId, f.projectId));
  if (f.partyId) conds.push(eq(accounts.partyId, f.partyId));
  if (f.workTypeId) conds.push(eq(accounts.workTypeId, f.workTypeId));
  if (f.category) conds.push(eq(parties.category, f.category as typeof parties.category.enumValues[number]));
  if (f.status === "open" || f.status === "closed") conds.push(eq(accounts.status, f.status));
  if (f.review) conds.push(eq(accounts.needsReview, true));
  if (f.q) conds.push(or(ilike(accounts.title, `%${f.q}%`), ilike(parties.name, `%${f.q}%`))!);

  const paid = sql<number>`coalesce((select sum(p.amount) from payments p where p.account_id = ${accounts.id}), 0)::float`;
  const paymentCount = sql<number>`(select count(*) from payments p where p.account_id = ${accounts.id})::int`;
  const lastPayment = sql<string | null>`(select max(p.date) from payments p where p.account_id = ${accounts.id})`;
  const works = sql<number>`coalesce((select sum(i.cum_qty * i.price) from account_items i where i.account_id = ${accounts.id} and i.active), 0)::float`;
  const certCount = sql<number>`(select count(*) from certificates c where c.account_id = ${accounts.id})::int`;

  return db.select({
    id: accounts.id, title: accounts.title, status: accounts.status, needsReview: accounts.needsReview, reviewNote: accounts.reviewNote,
    project: projects.name, projectId: projects.id, party: parties.name, partyId: parties.id, category: parties.category,
    workType: workTypes.name, paid, paymentCount, lastPayment, works, certCount,
  }).from(accounts)
    .innerJoin(projects, eq(accounts.projectId, projects.id))
    .innerJoin(parties, eq(accounts.partyId, parties.id))
    .leftJoin(workTypes, eq(accounts.workTypeId, workTypes.id))
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(desc(paid));
}

export async function getAccount(id: number) {
  const acc = await db.query.accounts.findFirst({
    where: eq(accounts.id, id),
    with: {
      project: true, party: true, workType: true,
      items: { orderBy: [asc(accountItems.sort), asc(accountItems.id)] },
      payments: { orderBy: [asc(payments.date), asc(payments.seq), asc(payments.id)] },
      certificates: { orderBy: [desc(certificates.date), desc(certificates.id)] },
    },
  });
  return acc ?? null;
}

export async function lookups() {
  const [ps, pts, wts] = await Promise.all([
    db.select().from(projects).orderBy(projects.sort, projects.name),
    db.select().from(parties).orderBy(parties.name),
    db.select().from(workTypes).orderBy(workTypes.name),
  ]);
  return { projects: ps, parties: pts, workTypes: wts };
}

/** Parties that have accounts in a project (for the certificate wizard). */
export async function partiesInProject(projectId: number) {
  return db.selectDistinct({ id: parties.id, name: parties.name, category: parties.category })
    .from(accounts).innerJoin(parties, eq(accounts.partyId, parties.id))
    .where(eq(accounts.projectId, projectId)).orderBy(parties.name);
}

export async function accountsFor(projectId: number, partyId: number) {
  return db.select({ id: accounts.id, title: accounts.title, status: accounts.status, workType: workTypes.name,
    items: sql<number>`(select count(*) from account_items i where i.account_id = ${accounts.id} and i.active)::int`,
    paid: sql<number>`coalesce((select sum(p.amount) from payments p where p.account_id = ${accounts.id}), 0)::float` })
    .from(accounts).leftJoin(workTypes, eq(accounts.workTypeId, workTypes.id))
    .where(and(eq(accounts.projectId, projectId), eq(accounts.partyId, partyId))).orderBy(accounts.id);
}

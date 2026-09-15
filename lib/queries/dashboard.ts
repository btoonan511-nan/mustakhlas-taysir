import { and, desc, eq, gte, lte, sql, type SQL } from "drizzle-orm";
import { db, schema } from "@/db";

export type DashboardFilters = { from?: string; to?: string; projectId?: number; category?: string; partyId?: number; workTypeId?: number };

const { payments, accounts, parties, projects, workTypes, accountItems } = schema;

function paymentWhere(f: DashboardFilters): SQL | undefined {
  const conds: SQL[] = [];
  if (f.from) conds.push(gte(payments.date, f.from));
  if (f.to) conds.push(lte(payments.date, f.to));
  if (f.projectId) conds.push(eq(accounts.projectId, f.projectId));
  if (f.partyId) conds.push(eq(accounts.partyId, f.partyId));
  if (f.workTypeId) conds.push(eq(accounts.workTypeId, f.workTypeId));
  if (f.category) conds.push(eq(parties.category, f.category as typeof parties.category.enumValues[number]));
  return conds.length ? and(...conds) : undefined;
}

const total = sql<number>`coalesce(sum(${payments.amount}), 0)::float`;
const count = sql<number>`count(*)::int`;

export async function dashboard(f: DashboardFilters) {
  const base = () => db.select().from(payments)
    .innerJoin(accounts, eq(payments.accountId, accounts.id))
    .innerJoin(parties, eq(accounts.partyId, parties.id))
    .innerJoin(projects, eq(accounts.projectId, projects.id))
    .leftJoin(workTypes, eq(accounts.workTypeId, workTypes.id));
  const where = paymentWhere(f);

  const summaryQ = db.select({
    total, payments: count,
    accounts: sql<number>`count(distinct ${accounts.id})::int`,
    parties: sql<number>`count(distinct ${parties.id})::int`,
    projects: sql<number>`count(distinct ${projects.id})::int`,
    minDate: sql<string | null>`min(${payments.date})`, maxDate: sql<string | null>`max(${payments.date})`,
  }).from(payments)
    .innerJoin(accounts, eq(payments.accountId, accounts.id))
    .innerJoin(parties, eq(accounts.partyId, parties.id))
    .innerJoin(projects, eq(accounts.projectId, projects.id))
    .where(where);

  const byProjectQ = db.select({ id: projects.id, name: projects.name, total, payments: count, accounts: sql<number>`count(distinct ${accounts.id})::int` })
    .from(payments).innerJoin(accounts, eq(payments.accountId, accounts.id)).innerJoin(parties, eq(accounts.partyId, parties.id)).innerJoin(projects, eq(accounts.projectId, projects.id))
    .where(where).groupBy(projects.id, projects.name).orderBy(desc(total));

  const byPartyQ = db.select({ id: parties.id, name: parties.name, category: parties.category, total, payments: count, accounts: sql<number>`count(distinct ${accounts.id})::int` })
    .from(payments).innerJoin(accounts, eq(payments.accountId, accounts.id)).innerJoin(parties, eq(accounts.partyId, parties.id)).innerJoin(projects, eq(accounts.projectId, projects.id))
    .where(where).groupBy(parties.id, parties.name, parties.category).orderBy(desc(total)).limit(15);

  const byWorkTypeQ = db.select({ id: workTypes.id, name: sql<string>`coalesce(${workTypes.name}, 'غير محدد')`, total, payments: count })
    .from(payments).innerJoin(accounts, eq(payments.accountId, accounts.id)).innerJoin(parties, eq(accounts.partyId, parties.id)).innerJoin(projects, eq(accounts.projectId, projects.id)).leftJoin(workTypes, eq(accounts.workTypeId, workTypes.id))
    .where(where).groupBy(workTypes.id, workTypes.name).orderBy(desc(total)).limit(15);

  const bySourceQ = db.select({ source: payments.source, total, payments: count })
    .from(payments).innerJoin(accounts, eq(payments.accountId, accounts.id)).innerJoin(parties, eq(accounts.partyId, parties.id)).innerJoin(projects, eq(accounts.projectId, projects.id))
    .where(where).groupBy(payments.source).orderBy(desc(total));

  const byCategoryQ = db.select({ category: parties.category, total, payments: count })
    .from(payments).innerJoin(accounts, eq(payments.accountId, accounts.id)).innerJoin(parties, eq(accounts.partyId, parties.id)).innerJoin(projects, eq(accounts.projectId, projects.id))
    .where(where).groupBy(parties.category).orderBy(desc(total));

  const month = sql<string>`to_char(${payments.date}, 'YYYY-MM')`;
  const byMonthQ = db.select({ month, total, payments: count })
    .from(payments).innerJoin(accounts, eq(payments.accountId, accounts.id)).innerJoin(parties, eq(accounts.partyId, parties.id)).innerJoin(projects, eq(accounts.projectId, projects.id))
    .where(and(where, sql`${payments.date} is not null`)).groupBy(month).orderBy(month);

  const year = sql<string>`to_char(${payments.date}, 'YYYY')`;
  const byYearQ = db.select({ year, total, payments: count })
    .from(payments).innerJoin(accounts, eq(payments.accountId, accounts.id)).innerJoin(parties, eq(accounts.partyId, parties.id)).innerJoin(projects, eq(accounts.projectId, projects.id))
    .where(and(where, sql`${payments.date} is not null`)).groupBy(year).orderBy(year);

  // top work items by approved value (cumQty * price) — meaningful once accounts carry items
  const itemValue = sql<number>`coalesce(sum(${accountItems.cumQty} * ${accountItems.price}), 0)::float`;
  const itemConds: SQL[] = [];
  if (f.projectId) itemConds.push(eq(accounts.projectId, f.projectId));
  if (f.partyId) itemConds.push(eq(accounts.partyId, f.partyId));
  if (f.workTypeId) itemConds.push(eq(accounts.workTypeId, f.workTypeId));
  const topItemsQ = db.select({ description: accountItems.description, unit: accountItems.unit, qty: sql<number>`sum(${accountItems.cumQty})::float`, value: itemValue, accounts: sql<number>`count(distinct ${accounts.id})::int` })
    .from(accountItems).innerJoin(accounts, eq(accountItems.accountId, accounts.id))
    .where(itemConds.length ? and(...itemConds) : undefined)
    .groupBy(accountItems.description, accountItems.unit).orderBy(desc(itemValue)).limit(15);

  const topPaymentsQ = base().where(where).orderBy(desc(payments.amount)).limit(10);

  // Neon HTTP handles concurrent requests; running the nine aggregations in parallel cuts the page from ~1.5s to ~0.5s
  const [[summary], byProject, byParty, byWorkType, byCategory, byMonth, byYear, topItems, topPayments, bySource] = await Promise.all([summaryQ, byProjectQ, byPartyQ, byWorkTypeQ, byCategoryQ, byMonthQ, byYearQ, topItemsQ, topPaymentsQ, bySourceQ]);
  return { summary, byProject, byParty, byWorkType, byCategory, byMonth, byYear, topItems, topPayments, bySource };
}

export async function filterOptions() {
  const [ps, pts, wts] = await Promise.all([
    db.select({ id: projects.id, name: projects.name }).from(projects).orderBy(projects.sort, projects.name),
    db.select({ id: parties.id, name: parties.name, category: parties.category }).from(parties).orderBy(parties.name),
    db.select({ id: workTypes.id, name: workTypes.name }).from(workTypes).orderBy(workTypes.name),
  ]);
  return { projects: ps, parties: pts, workTypes: wts };
}

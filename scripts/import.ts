import "dotenv/config";
import { readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import bcrypt from "bcryptjs";
import { sql as dsql } from "drizzle-orm";
import { db, schema } from "../db";
import { parseCashboxWorkbook, type RawAccount } from "../lib/import/cashbox";
import { parseIslamDocx } from "../lib/import/islam-docx";
import { CASHBOX_PROJECTS, PROJECT_SEED, normalizeArabic, parseHeading, resolveProjectByAlias, type HeadingParse } from "../lib/import/normalize";

const RAW = join(process.cwd(), "data/raw");
const report: string[] = [];
const log = (s: string) => { console.log(s); report.push(s); };

/** Neon HTTP occasionally times out; retry. */
async function retry<T>(fn: () => Promise<T>, tries = 5): Promise<T> {
  let last: unknown;
  for (let i = 0; i < tries; i++) {
    try { return await fn(); } catch (e) { last = e; await new Promise((r) => setTimeout(r, 800 * (i + 1))); }
  }
  throw last;
}
const chunk = <T,>(arr: T[], n: number) => Array.from({ length: Math.ceil(arr.length / n) }, (_, i) => arr.slice(i * n, i * n + n));

async function resetTables() {
  await db.execute(dsql`TRUNCATE certificate_items, certificates, payments, account_items, accounts, legacy_certificates, parties, work_types, projects RESTART IDENTITY CASCADE`);
}

async function seedUsers() {
  const admin = process.env.ADMIN_PASSWORD ?? "admin1234";
  const user = process.env.USER_PASSWORD ?? "islam1234";
  for (const u of [
    { username: "admin", displayName: "المدير", role: "admin" as const, pw: admin },
    { username: "islam", displayName: "م. إسلام", role: "user" as const, pw: user },
  ]) {
    const hash = await bcrypt.hash(u.pw, 10);
    await db.insert(schema.users).values({ username: u.username, displayName: u.displayName, role: u.role, passwordHash: hash })
      .onConflictDoUpdate({ target: schema.users.username, set: { displayName: u.displayName, role: u.role } });
  }
}

async function seedProjects() {
  return db.insert(schema.projects).values(PROJECT_SEED.map((p) => ({ name: p.name, aliases: p.aliases, sort: p.sort }))).returning();
}

/** Merge continuation blocks (supplier monthly statements) inside one sheet and drop carry-forward rows. */
function mergeBlocks(accounts: RawAccount[]): RawAccount[] {
  const bySheet = new Map<string, RawAccount[]>();
  for (const a of accounts) {
    const list = bySheet.get(a.sheet) ?? [];
    list.push(a);
    bySheet.set(a.sheet, list);
  }
  const keyOf = (a: RawAccount) => normalizeArabic(a.headingRaw.replace(/الفواتير|\d+/g, ""));
  const out: RawAccount[] = [];
  for (const list of bySheet.values()) {
    const merged: RawAccount[] = [];
    for (const a of list) {
      const key = keyOf(a);
      const trivial = key.length < 3;
      // A block is a *continuation* of the previous one when its heading is trivial, or it carries a
      // "رصيد من شهر" balance row, or it's a supplier monthly statement with the same heading.
      const isContinuation = trivial || a.payments.some((p) => /^رصيد/.test(p.label)) || /الفواتير/.test(a.headingRaw);
      const sameHeading = merged.find((m) => keyOf(m) === key);
      const target = isContinuation ? (sameHeading ?? merged[merged.length - 1]) : undefined;
      const clean = a.payments.filter((p) => !/^رصيد/.test(p.label) && !/رصيد من شهر/.test(p.label));
      if (target) {
        // if the master block already balances with its declared total, the monthly re-listings are redundant
        const masterSum = target.payments.reduce((s, p) => s + p.amount, 0);
        if (target.declaredTotal !== null && Math.abs(target.declaredTotal - masterSum) <= 1) continue;
        const seen = new Set(target.payments.map((p) => `${p.date ?? p.dateRaw}|${p.amount}|${normalizeArabic(p.label)}`));
        for (const p of clean) {
          const k = `${p.date ?? p.dateRaw}|${p.amount}|${normalizeArabic(p.label)}`;
          if (!seen.has(k)) { target.payments.push(p); seen.add(k); }
        }
        if (a.status === "خالص") target.status = "خالص";
        target.notes.push(...a.notes);
      } else {
        merged.push({ ...a, payments: clean });
      }
    }
    out.push(...merged.filter((m) => m.payments.length > 0 || m.declaredTotal));
  }
  return out;
}

type Project = { id: number; name: string; aliases: string[] };
type Prepared = { raw: RawAccount; file: string; project: Project; h: HeadingParse; needsReview: boolean; reviewNote: string; sum: number };

function prepareCashbox(projects: Project[]): Prepared[] {
  const prepared: Prepared[] = [];
  for (const file of readdirSync(join(RAW, "cashbox"))) {
    const fileKey = Object.keys(CASHBOX_PROJECTS).find((k) => normalizeArabic(k) === normalizeArabic(file)) ?? "";
    const projectName = CASHBOX_PROJECTS[fileKey];
    if (!projectName) { log(`⚠ ملف صندوق غير معروف: ${file}`); continue; }
    const baseProject = projects.find((p) => p.name === projectName)!;
    const raw = mergeBlocks(parseCashboxWorkbook(join(RAW, "cashbox", file), file));
    log(`📁 ${file} → ${projectName}: ${raw.length} حساب`);

    for (const a of raw) {
      let project = baseProject;
      const h = parseHeading(a.headingRaw, a.sheet, projectName);
      let needsReview = h.needsReview;
      const notes: string[] = h.note ? [h.note] : [];
      if (normalizeArabic(fileKey).includes("ممدوح") && /استراح/.test(a.headingRaw)) {
        project = projects.find((p) => p.name === "استراحة أبو محمد")!;
        needsReview = true; notes.push("نُقل تلقائياً إلى استراحة أبو محمد — تأكد");
      }
      if (projectName.includes("يحتاج تحديد")) { needsReview = true; notes.push("حدد المسجد"); }
      const badDates = a.payments.filter((p) => !p.date).length;
      if (badDates) { needsReview = true; notes.push(`${badDates} دفعة بتاريخ غير مقروء`); }
      const sum = a.payments.reduce((s, p) => s + p.amount, 0);
      if (a.declaredTotal !== null && Math.abs(a.declaredTotal - sum) > 1) {
        needsReview = true; notes.push(`مجموع الدفعات ${Math.round(sum)} ≠ الإجمالي المكتوب ${Math.round(a.declaredTotal)}`);
      }
      prepared.push({ raw: a, file, project, h, needsReview, reviewNote: notes.join(" · "), sum });
    }
  }
  return prepared;
}

async function importCashbox(projects: Project[]) {
  const prepared = prepareCashbox(projects);

  // parties + work types in bulk
  const partyMap = new Map<string, { name: string; category: HeadingParse["category"] }>();
  const workMap = new Map<string, string>();
  for (const p of prepared) {
    if (!partyMap.has(normalizeArabic(p.h.party))) partyMap.set(normalizeArabic(p.h.party), { name: p.h.party, category: p.h.category });
    if (!workMap.has(normalizeArabic(p.h.workType))) workMap.set(normalizeArabic(p.h.workType), p.h.workType);
  }
  const partyRows = await retry(() => db.insert(schema.parties).values([...partyMap.values()]).returning({ id: schema.parties.id, name: schema.parties.name }));
  const workRows = await retry(() => db.insert(schema.workTypes).values([...workMap.values()].map((name) => ({ name }))).returning({ id: schema.workTypes.id, name: schema.workTypes.name }));
  const partyId = new Map(partyRows.map((r) => [normalizeArabic(r.name), r.id]));
  const workId = new Map(workRows.map((r) => [normalizeArabic(r.name), r.id]));

  // accounts in bulk (returning ids in insertion order)
  const accountRows = await retry(() => db.insert(schema.accounts).values(prepared.map((p) => ({
    projectId: p.project.id, partyId: partyId.get(normalizeArabic(p.h.party))!, workTypeId: workId.get(normalizeArabic(p.h.workType))!,
    title: p.raw.headingRaw.replace(/^\.\s*/, "").trim() || `${p.h.party} / ${p.h.workType}`,
    status: p.raw.status === "خالص" ? "closed" as const : "open" as const,
    needsReview: p.needsReview, reviewNote: p.reviewNote, notes: p.raw.notes.join(" | "),
    sourceFile: p.file, sourceSheet: p.raw.sheet, sourceHeading: p.raw.headingRaw,
  }))).returning({ id: schema.accounts.id }));

  // payments in chunks
  const paymentValues = prepared.flatMap((p, idx) => p.raw.payments.map((pay, i) => ({
    accountId: accountRows[idx].id, seq: pay.seq ?? i + 1, date: pay.date, dateRaw: pay.dateRaw, amount: pay.amount,
    method: pay.method, voucher: pay.voucher, label: pay.label, note: pay.note, sourceFile: p.file, sourceSheet: p.raw.sheet,
  })));
  for (const part of chunk(paymentValues, 400)) await retry(() => db.insert(schema.payments).values(part));

  const total = prepared.reduce((s, p) => s + p.sum, 0);
  log(`\n✅ الصندوق: ${prepared.length} حساب، ${paymentValues.length} دفعة، ${partyRows.length} جهة، الإجمالي ${total.toLocaleString("en")} ر.س`);
  const reviews = prepared.filter((p) => p.needsReview);
  log(`🔎 حسابات تحتاج مراجعة: ${reviews.length}`);
  for (const p of reviews) log(`  • [${p.project.name}] ${p.raw.sheet} — ${p.raw.headingRaw.slice(0, 60)} :: ${p.reviewNote}`);
}

async function importLegacy(projects: Project[]) {
  const values: (typeof schema.legacyCertificates.$inferInsert)[] = [];
  const unresolved: string[] = [];
  for (const file of readdirSync(join(RAW, "islam"))) {
    const certs = await parseIslamDocx(join(RAW, "islam", file), file);
    for (const c of certs) {
      const projectId = resolveProjectByAlias(c.projectRaw, projects);
      if (!projectId) unresolved.push(`  • ${file} #${c.index}: "${c.projectRaw}" — ${c.contractorRaw} / ${c.workTypeRaw}`);
      values.push({
        sourceFile: file, sourceIndex: c.index, projectRaw: c.projectRaw, projectId, workTypeRaw: c.workTypeRaw,
        contractorRaw: c.contractorRaw, phone: c.phone, date: c.date, dateRaw: c.dateRaw,
        items: c.items, footer: c.footer, total: c.total, previousPaid: c.previousPaid, due: c.due, warnings: c.warnings,
      });
    }
  }
  for (const part of chunk(values, 50)) await retry(() => db.insert(schema.legacyCertificates).values(part));
  log(`\n✅ مستخلصات إسلام: ${values.length} مستخلص`);
  if (unresolved.length) { log(`🔎 مشاريع غير معروفة (تحتاج تحديد يدوي): ${unresolved.length}`); unresolved.forEach((u) => log(u)); }
}

async function main() {
  const t0 = Date.now();
  await resetTables();
  await seedUsers();
  const projects = await seedProjects();
  await importCashbox(projects);
  await importLegacy(projects);
  log(`\n⏱ ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  writeFileSync(join(process.cwd(), "data/import-report.txt"), report.join("\n"), "utf8");
}
main().catch((e) => { console.error(e); process.exit(1); });

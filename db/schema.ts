import {
  pgTable, serial, text, integer, boolean, timestamp, date, numeric, jsonb, pgEnum, index, uniqueIndex,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

const money = (name: string) => numeric(name, { precision: 14, scale: 2, mode: "number" });
const qty = (name: string) => numeric(name, { precision: 14, scale: 3, mode: "number" });

export const partyCategory = pgEnum("party_category", ["contractor", "supplier", "equipment", "rental", "other"]);
export const accountStatus = pgEnum("account_status", ["open", "closed"]);
export const certificateStatus = pgEnum("certificate_status", ["draft", "approved"]);
export const certificateSource = pgEnum("certificate_source", ["system", "legacy"]);
export const legacyStatus = pgEnum("legacy_status", ["pending", "linked", "ignored"]);
export const userRole = pgEnum("user_role", ["admin", "user"]);

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  displayName: text("display_name").notNull(),
  passwordHash: text("password_hash").notNull(),
  role: userRole("role").notNull().default("user"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const projects = pgTable("projects", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
  aliases: text("aliases").array().notNull().default([]),
  active: boolean("active").notNull().default(true),
  sort: integer("sort").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const parties = pgTable("parties", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  phone: text("phone").notNull().default(""),
  category: partyCategory("category").notNull().default("contractor"),
  aliases: text("aliases").array().notNull().default([]),
  notes: text("notes").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex("parties_name_idx").on(t.name)]);

export const workTypes = pgTable("work_types", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
});

/** An account = one party doing one kind of work inside one project. Payments, items and certificates hang off it. */
export const accounts = pgTable("accounts", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id").notNull().references(() => projects.id),
  partyId: integer("party_id").notNull().references(() => parties.id),
  workTypeId: integer("work_type_id").references(() => workTypes.id),
  title: text("title").notNull(),
  status: accountStatus("status").notNull().default("open"),
  needsReview: boolean("needs_review").notNull().default(false),
  reviewNote: text("review_note").notNull().default(""),
  notes: text("notes").notNull().default(""),
  sourceFile: text("source_file").notNull().default(""),
  sourceSheet: text("source_sheet").notNull().default(""),
  sourceHeading: text("source_heading").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("accounts_project_idx").on(t.projectId), index("accounts_party_idx").on(t.partyId)]);

/** Work items of an account. cumQty is the approved cumulative quantity (= "جملة" of the latest approved certificate). */
export const accountItems = pgTable("account_items", {
  id: serial("id").primaryKey(),
  accountId: integer("account_id").notNull().references(() => accounts.id, { onDelete: "cascade" }),
  sort: integer("sort").notNull().default(0),
  description: text("description").notNull(),
  unit: text("unit").notNull().default(""),
  price: money("price").notNull().default(0),
  cumQty: qty("cum_qty").notNull().default(0),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("account_items_account_idx").on(t.accountId)]);

/** Cashbox payments. */
export const payments = pgTable("payments", {
  id: serial("id").primaryKey(),
  accountId: integer("account_id").notNull().references(() => accounts.id, { onDelete: "cascade" }),
  seq: integer("seq"),
  date: date("date"),
  dateRaw: text("date_raw").notNull().default(""),
  amount: money("amount").notNull(),
  method: text("method").notNull().default(""),
  voucher: text("voucher").notNull().default(""),
  label: text("label").notNull().default(""),
  note: text("note").notNull().default(""),
  isOpening: boolean("is_opening").notNull().default(false),
  sourceFile: text("source_file").notNull().default(""),
  sourceSheet: text("source_sheet").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("payments_account_idx").on(t.accountId), index("payments_date_idx").on(t.date)]);

export const certificates = pgTable("certificates", {
  id: serial("id").primaryKey(),
  accountId: integer("account_id").notNull().references(() => accounts.id, { onDelete: "cascade" }),
  number: integer("number").notNull().default(1),
  date: date("date").notNull(),
  status: certificateStatus("status").notNull().default("draft"),
  source: certificateSource("source").notNull().default("system"),
  total: money("total").notNull().default(0),
  previousPaid: money("previous_paid").notNull().default(0),
  deductions: money("deductions").notNull().default(0),
  due: money("due").notNull().default(0),
  notes: text("notes").notNull().default(""),
  legacyId: integer("legacy_id"),
  createdBy: integer("created_by").references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  approvedAt: timestamp("approved_at", { withTimezone: true }),
}, (t) => [index("certificates_account_idx").on(t.accountId)]);

export const certificateItems = pgTable("certificate_items", {
  id: serial("id").primaryKey(),
  certificateId: integer("certificate_id").notNull().references(() => certificates.id, { onDelete: "cascade" }),
  accountItemId: integer("account_item_id").references(() => accountItems.id, { onDelete: "set null" }),
  sort: integer("sort").notNull().default(0),
  description: text("description").notNull(),
  unit: text("unit").notNull().default(""),
  prevQty: qty("prev_qty").notNull().default(0),
  currentQty: qty("current_qty").notNull().default(0),
  totalQty: qty("total_qty").notNull().default(0),
  price: money("price").notNull().default(0),
  amount: money("amount").notNull().default(0),
  note: text("note").notNull().default(""),
}, (t) => [index("certificate_items_cert_idx").on(t.certificateId)]);

/** Islam's old Word certificates, parsed as-is, waiting to be linked to an account. */
export const legacyCertificates = pgTable("legacy_certificates", {
  id: serial("id").primaryKey(),
  sourceFile: text("source_file").notNull(),
  sourceIndex: integer("source_index").notNull(),
  projectRaw: text("project_raw").notNull().default(""),
  projectId: integer("project_id").references(() => projects.id),
  workTypeRaw: text("work_type_raw").notNull().default(""),
  contractorRaw: text("contractor_raw").notNull().default(""),
  phone: text("phone").notNull().default(""),
  date: date("date"),
  dateRaw: text("date_raw").notNull().default(""),
  items: jsonb("items").notNull().default([]),
  footer: jsonb("footer").notNull().default([]),
  total: money("total"),
  previousPaid: money("previous_paid"),
  due: money("due"),
  warnings: jsonb("warnings").notNull().default([]),
  status: legacyStatus("status").notNull().default("pending"),
  linkedAccountId: integer("linked_account_id").references(() => accounts.id, { onDelete: "set null" }),
  linkedCertificateId: integer("linked_certificate_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex("legacy_source_idx").on(t.sourceFile, t.sourceIndex)]);

export const projectsRelations = relations(projects, ({ many }) => ({ accounts: many(accounts) }));
export const partiesRelations = relations(parties, ({ many }) => ({ accounts: many(accounts) }));
export const accountsRelations = relations(accounts, ({ one, many }) => ({
  project: one(projects, { fields: [accounts.projectId], references: [projects.id] }),
  party: one(parties, { fields: [accounts.partyId], references: [parties.id] }),
  workType: one(workTypes, { fields: [accounts.workTypeId], references: [workTypes.id] }),
  items: many(accountItems),
  payments: many(payments),
  certificates: many(certificates),
}));
export const accountItemsRelations = relations(accountItems, ({ one }) => ({
  account: one(accounts, { fields: [accountItems.accountId], references: [accounts.id] }),
}));
export const paymentsRelations = relations(payments, ({ one }) => ({
  account: one(accounts, { fields: [payments.accountId], references: [accounts.id] }),
}));
export const certificatesRelations = relations(certificates, ({ one, many }) => ({
  account: one(accounts, { fields: [certificates.accountId], references: [accounts.id] }),
  items: many(certificateItems),
}));
export const certificateItemsRelations = relations(certificateItems, ({ one }) => ({
  certificate: one(certificates, { fields: [certificateItems.certificateId], references: [certificates.id] }),
  accountItem: one(accountItems, { fields: [certificateItems.accountItemId], references: [accountItems.id] }),
}));
export const legacyRelations = relations(legacyCertificates, ({ one }) => ({
  project: one(projects, { fields: [legacyCertificates.projectId], references: [projects.id] }),
  linkedAccount: one(accounts, { fields: [legacyCertificates.linkedAccountId], references: [accounts.id] }),
}));

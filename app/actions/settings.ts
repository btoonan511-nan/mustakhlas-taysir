"use server";

import { revalidatePath } from "next/cache";
import { eq, ne, and } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireAdmin } from "@/lib/auth";
import bcrypt from "bcryptjs";

const id = (fd: FormData, k: string) => { const v = Number(fd.get(k)); return Number.isFinite(v) && v > 0 ? v : null; };
const s = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const all = () => { revalidatePath("/settings"); revalidatePath("/accounts"); revalidatePath("/"); revalidatePath("/reconciliation"); };

export async function addProjectAction(fd: FormData) {
  await requireAdmin();
  const name = s(fd, "name"); if (!name) return;
  await db.insert(schema.projects).values({ name, sort: 50 }).onConflictDoNothing();
  all();
}
export async function updateProjectAction(fd: FormData) {
  await requireAdmin();
  await db.update(schema.projects).set({ name: s(fd, "name"), active: fd.get("active") === "on", aliases: s(fd, "aliases").split(/[،,]/).map((a) => a.trim()).filter(Boolean) }).where(eq(schema.projects.id, id(fd, "projectId")!));
  all();
}
export async function deleteProjectAction(fd: FormData) {
  await requireAdmin();
  const pid = id(fd, "projectId")!;
  const [a] = await db.select({ id: schema.accounts.id }).from(schema.accounts).where(eq(schema.accounts.projectId, pid)).limit(1);
  if (a) throw new Error("المشروع فيه حسابات — انقلها أولاً");
  await db.delete(schema.projects).where(eq(schema.projects.id, pid));
  all();
}

export async function updatePartyAction(fd: FormData) {
  await requireAdmin();
  await db.update(schema.parties).set({ name: s(fd, "name"), phone: s(fd, "phone"), category: s(fd, "category") as typeof schema.parties.category.enumValues[number], notes: s(fd, "notes") }).where(eq(schema.parties.id, id(fd, "partyId")!));
  all();
}
/** Merge party `from` into `into`: accounts move, the source row is deleted. */
export async function mergePartyAction(fd: FormData) {
  await requireAdmin();
  const from = id(fd, "fromId"), into = id(fd, "intoId");
  if (!from || !into || from === into) return;
  const [src] = await db.select().from(schema.parties).where(eq(schema.parties.id, from));
  const [dst] = await db.select().from(schema.parties).where(eq(schema.parties.id, into));
  await db.update(schema.accounts).set({ partyId: into }).where(eq(schema.accounts.partyId, from));
  await db.update(schema.parties).set({ aliases: [...new Set([...dst.aliases, src.name, ...src.aliases])], phone: dst.phone || src.phone }).where(eq(schema.parties.id, into));
  await db.delete(schema.parties).where(eq(schema.parties.id, from));
  all();
}

export async function updateWorkTypeAction(fd: FormData) {
  await requireAdmin();
  await db.update(schema.workTypes).set({ name: s(fd, "name") }).where(eq(schema.workTypes.id, id(fd, "workTypeId")!));
  all();
}
export async function mergeWorkTypeAction(fd: FormData) {
  await requireAdmin();
  const from = id(fd, "fromId"), into = id(fd, "intoId");
  if (!from || !into || from === into) return;
  await db.update(schema.accounts).set({ workTypeId: into }).where(eq(schema.accounts.workTypeId, from));
  await db.delete(schema.workTypes).where(and(eq(schema.workTypes.id, from), ne(schema.workTypes.id, into)));
  all();
}
export async function addWorkTypeAction(fd: FormData) {
  await requireAdmin();
  const name = s(fd, "name"); if (!name) return;
  await db.insert(schema.workTypes).values({ name }).onConflictDoNothing();
  all();
}

export async function changePasswordAction(fd: FormData) {
  await requireAdmin();
  const username = s(fd, "username"); const password = s(fd, "password");
  if (!username || password.length < 6) throw new Error("كلمة المرور 6 أحرف على الأقل");
  await db.update(schema.users).set({ passwordHash: await bcrypt.hash(password, 10) }).where(eq(schema.users.username, username));
  revalidatePath("/settings");
}

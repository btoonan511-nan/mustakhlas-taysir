"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireAdmin } from "@/lib/auth";
import { linkLegacyToAccount, createAccountFromLegacy } from "@/lib/reconcile";

const id = (fd: FormData, k: string) => { const v = Number(fd.get(k)); return Number.isFinite(v) && v > 0 ? v : null; };
const s = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();

function revalidateAll(accountId?: number) {
  revalidatePath("/reconciliation"); revalidatePath("/accounts"); revalidatePath("/"); revalidatePath("/certificates");
  if (accountId) revalidatePath(`/accounts/${accountId}`);
}

export async function linkLegacyAction(fd: FormData) {
  await requireAdmin();
  const legacyId = id(fd, "legacyId")!;
  // either a hidden accountId (candidate button) or a datalist pick like "#42 · روبل — ..."
  const picked = Number((s(fd, "accountPick").match(/^#(\d+)/) ?? [])[1]);
  const accountId = id(fd, "accountId") ?? (picked > 0 ? picked : null);
  if (!accountId) throw new Error("اختر الحساب من القائمة");
  await linkLegacyToAccount(legacyId, accountId);
  revalidateAll(accountId);
}

export async function createAccountFromLegacyAction(fd: FormData) {
  await requireAdmin();
  const legacyId = id(fd, "legacyId")!;
  const projectId = id(fd, "projectId");
  if (!projectId) throw new Error("حدد المشروع أولاً");
  const accId = await createAccountFromLegacy(legacyId, projectId, s(fd, "partyName"));
  revalidateAll(accId);
}

export async function ignoreLegacyAction(fd: FormData) {
  await requireAdmin();
  await db.update(schema.legacyCertificates).set({ status: "ignored" }).where(eq(schema.legacyCertificates.id, id(fd, "legacyId")!));
  revalidateAll();
}

export async function restoreLegacyAction(fd: FormData) {
  await requireAdmin();
  await db.update(schema.legacyCertificates).set({ status: "pending" }).where(and(eq(schema.legacyCertificates.id, id(fd, "legacyId")!), eq(schema.legacyCertificates.status, "ignored")));
  revalidateAll();
}

export async function setLegacyProjectAction(fd: FormData) {
  await requireAdmin();
  await db.update(schema.legacyCertificates).set({ projectId: id(fd, "projectId") }).where(eq(schema.legacyCertificates.id, id(fd, "legacyId")!));
  revalidatePath("/reconciliation");
}

/** Quick fixes for flagged accounts: move project / clear flag. */
export async function resolveAccountAction(fd: FormData) {
  await requireAdmin();
  const accountId = id(fd, "accountId")!;
  const projectId = id(fd, "projectId");
  const partyId = id(fd, "partyId");
  const workTypeId = id(fd, "workTypeId");
  await db.update(schema.accounts).set({ ...(projectId ? { projectId } : {}), ...(partyId ? { partyId } : {}), ...(workTypeId ? { workTypeId } : {}), needsReview: fd.get("keep") === "on", reviewNote: fd.get("keep") === "on" ? s(fd, "reviewNote") : "" })
    .where(eq(schema.accounts.id, accountId));
  revalidateAll(accountId);
}

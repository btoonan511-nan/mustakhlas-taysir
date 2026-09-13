import Link from "next/link";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireAdmin } from "@/lib/auth";
import { pendingLegacy, allAccountsLite, candidates, legacyItems } from "@/lib/queries/reconciliation";
import { lookups } from "@/lib/queries/accounts";
import { money, fmtDate, CATEGORY_LABEL } from "@/lib/format";
import { linkLegacyAction, createAccountFromLegacyAction, ignoreLegacyAction, restoreLegacyAction, setLegacyProjectAction, resolveAccountAction } from "@/app/actions/reconciliation";
import { ConfirmButton } from "@/app/(app)/confirm-button";
import { Details } from "@/app/(app)/details";

export default async function ReconciliationPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  await requireAdmin();
  const { tab = "legacy" } = await searchParams;
  const [pending, accounts, opts, ignored, linked] = await Promise.all([
    pendingLegacy(), allAccountsLite(), lookups(),
    db.query.legacyCertificates.findMany({ where: eq(schema.legacyCertificates.status, "ignored") }),
    db.query.legacyCertificates.findMany({ where: eq(schema.legacyCertificates.status, "linked"), with: { linkedAccount: true } }),
  ]);
  const flagged = accounts.filter((a) => a.needsReview);
  const accountOptions = [...accounts].sort((a, b) => a.project.localeCompare(b.project, "ar") || a.party.localeCompare(b.party, "ar"));

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">المطابقة وتنظيف البيانات</h1>
        <p className="text-sm text-stone-500">مرة واحدة: اربط مستخلصات إسلام القديمة بحسابات الصندوق لتنسحب بنود الأعمال إليها، وراجع الحسابات المعلّمة.</p>
      </div>
      <div className="flex gap-2 border-b border-stone-200">
        <Tab href="/reconciliation?tab=legacy" active={tab === "legacy"} label={`مستخلصات إسلام (${pending.length})`} />
        <Tab href="/reconciliation?tab=accounts" active={tab === "accounts"} label={`حسابات تحتاج مراجعة (${flagged.length})`} />
        <Tab href="/reconciliation?tab=done" active={tab === "done"} label={`المربوطة (${linked.length}) · المتجاهَلة (${ignored.length})`} />
      </div>

      {tab === "legacy" && (
        <div className="space-y-3">
          {pending.length === 0 && <p className="card p-6 text-center text-stone-500">🎉 كل مستخلصات إسلام مربوطة.</p>}
          {pending.map((c) => {
            const items = legacyItems(c);
            const cands = candidates({ projectId: c.projectId, contractorRaw: c.contractorRaw, workTypeRaw: c.workTypeRaw, date: c.date, previousPaid: c.previousPaid, total: c.total }, accounts);
            const warnings = Array.isArray(c.warnings) ? (c.warnings as string[]) : [];
            return (
              <div key={c.id} className="card p-4">
                <div className="flex flex-wrap justify-between gap-2">
                  <div>
                    <div className="font-bold text-lg">{c.contractorRaw || "—"} <span className="text-stone-400 font-normal num text-sm">{c.phone}</span> · {c.workTypeRaw || "—"}</div>
                    <div className="text-sm text-stone-600">
                      مشروع: {c.project ? <b>{c.project.name}</b> : <span className="text-red-600">غير محدد ({c.projectRaw})</span>}
                      <span className="mx-2">·</span> التاريخ: <span className="num">{c.date ? fmtDate(c.date) : <span className="text-red-600">{c.dateRaw || "—"}</span>}</span>
                      <span className="mx-2">·</span> <span className="text-stone-400 text-xs">{c.sourceFile} #{c.sourceIndex + 1}</span>
                    </div>
                  </div>
                  <div className="text-sm text-left">
                    <div>الإجمالي: <b className="num">{money(c.total)}</b></div>
                    <div>سبق صرفه: <b className="num">{money(c.previousPaid)}</b></div>
                    <div>المستحق: <b className="num">{money(c.due)}</b></div>
                  </div>
                </div>
                {warnings.length > 0 && <div className="mt-2 text-xs text-amber-700">⚠ {warnings.join(" · ")}</div>}

                <Details title={`بنود الأعمال (${items.length})`} className="mt-3 border-stone-100! shadow-none!">
                  <table className="table text-xs">
                    <thead><tr><th>البيان</th><th>الوحدة</th><th>سابق</th><th>حالي</th><th>جملة</th><th>السعر</th><th>القيمة</th></tr></thead>
                    <tbody>{items.map((it, i) => <tr key={i}><td>{it.description}</td><td>{it.unit}</td><td className="num">{it.prevQty ?? "—"}</td><td className="num">{it.currentQty ?? "—"}</td><td className="num">{it.totalQty ?? "—"}</td><td className="num">{it.price ?? "—"}</td><td className="num">{money(it.amount)}</td></tr>)}</tbody>
                  </table>
                </Details>

                <div className="mt-3 grid md:grid-cols-2 gap-3">
                  <div>
                    <div className="text-xs font-semibold text-stone-500 mb-1">الحسابات المرشّحة من الصندوق</div>
                    {cands.length === 0 && <p className="text-sm text-stone-400">لا يوجد مرشح واضح — اختر من القائمة أو أنشئ حساباً جديداً.</p>}
                    <ul className="space-y-1">
                      {cands.map((k) => (
                        <li key={k.accountId} className="flex items-center justify-between gap-2 rounded-lg border border-stone-200 px-3 py-2 text-sm">
                          <div>
                            <Link href={`/accounts/${k.accountId}`} target="_blank" className="font-medium hover:underline">{k.party} — {k.title}</Link>
                            <div className="text-xs text-stone-500">{k.project} · {k.workType} · صُرف <span className="num">{money(k.paid)}</span>{k.paidBefore !== k.paid ? <> (حتى تاريخ المستخلص <span className="num">{money(k.paidBefore)}</span>)</> : null}</div>
                            <div className="text-xs text-emerald-700">{k.reasons.join(" · ")}</div>
                          </div>
                          <form action={linkLegacyAction}><input type="hidden" name="legacyId" value={c.id} /><input type="hidden" name="accountId" value={k.accountId} /><button className="btn-primary btn-sm">ربط</button></form>
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div className="space-y-2">
                    <form action={linkLegacyAction} className="flex gap-2 items-end">
                      <input type="hidden" name="legacyId" value={c.id} />
                      <div className="flex-1"><label className="label">أو اختر أي حساب</label>
                        <select name="accountId" className="input" defaultValue=""><option value="">—</option>{accountOptions.map((a) => <option key={a.id} value={a.id}>{a.project} › {a.party} — {a.title}</option>)}</select></div>
                      <button className="btn-secondary">ربط</button>
                    </form>
                    <form action={createAccountFromLegacyAction} className="flex gap-2 items-end">
                      <input type="hidden" name="legacyId" value={c.id} />
                      <div className="flex-1"><label className="label">أو أنشئ حساباً جديداً (لا يوجد له بالصندوق)</label>
                        <div className="flex gap-2">
                          <select name="projectId" className="input" defaultValue={c.projectId ?? ""}><option value="">المشروع…</option>{opts.projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
                          <input name="partyName" className="input" defaultValue={c.contractorRaw} placeholder="اسم المقاول" />
                        </div></div>
                      <button className="btn-secondary">إنشاء وربط</button>
                    </form>
                    <div className="flex gap-2 items-end">
                      {!c.projectId && (
                        <form action={setLegacyProjectAction} className="flex gap-2 items-end flex-1">
                          <input type="hidden" name="legacyId" value={c.id} />
                          <div className="flex-1"><label className="label">تحديد مشروع المستخلص</label><select name="projectId" className="input" defaultValue=""><option value="">—</option>{opts.projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></div>
                          <button className="btn-secondary">حفظ</button>
                        </form>
                      )}
                      <form action={ignoreLegacyAction}><input type="hidden" name="legacyId" value={c.id} /><ConfirmButton className="btn-danger" message="تجاهل هذا المستخلص؟ (يمكن استرجاعه لاحقاً)">تجاهل</ConfirmButton></form>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {tab === "accounts" && (
        <div className="card overflow-x-auto">
          <table className="table">
            <thead><tr><th>الحساب</th><th>الجهة</th><th>المشروع الحالي</th><th>السبب</th><th>المصروف</th><th>الإجراء</th></tr></thead>
            <tbody>
              {flagged.map((a) => (
                <tr key={a.id}>
                  <td><Link href={`/accounts/${a.id}`} className="font-medium hover:underline">{a.title}</Link><div className="text-xs text-stone-400">{a.workType}</div></td>
                  <td>{a.party}</td>
                  <td>{a.project}</td>
                  <td className="text-xs text-amber-800 max-w-xs">{a.reviewNote}</td>
                  <td className="num">{money(a.paid)}</td>
                  <td>
                    <form action={resolveAccountAction} className="flex flex-wrap gap-1 items-center">
                      <input type="hidden" name="accountId" value={a.id} />
                      <select name="projectId" className="input py-1! w-44" defaultValue={a.projectId}>{opts.projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
                      <select name="partyId" className="input py-1! w-40" defaultValue={a.partyId}>{opts.parties.map((p) => <option key={p.id} value={p.id}>{p.name} ({CATEGORY_LABEL[p.category]})</option>)}</select>
                      <label className="text-xs flex items-center gap-1"><input type="checkbox" name="keep" /> إبقاء العلامة</label>
                      <input type="hidden" name="reviewNote" value={a.reviewNote} />
                      <button className="btn-primary btn-sm">تم</button>
                    </form>
                  </td>
                </tr>
              ))}
              {flagged.length === 0 && <tr><td colSpan={6} className="text-center text-stone-500 py-6">لا توجد حسابات معلّمة للمراجعة.</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {tab === "done" && (
        <div className="space-y-4">
          <div className="card overflow-x-auto">
            <h2 className="font-semibold p-4 pb-0">المربوطة</h2>
            <table className="table">
              <thead><tr><th>المقاول</th><th>نوع العمل</th><th>التاريخ</th><th>الإجمالي</th><th>ربط بـ</th></tr></thead>
              <tbody>{linked.map((c) => (
                <tr key={c.id}><td>{c.contractorRaw}</td><td>{c.workTypeRaw}</td><td className="num">{fmtDate(c.date)}</td><td className="num">{money(c.total)}</td>
                  <td>{c.linkedAccount ? <Link href={`/accounts/${c.linkedAccount.id}`} className="hover:underline">{c.linkedAccount.title}</Link> : "—"} {c.linkedCertificateId && <Link href={`/certificates/${c.linkedCertificateId}`} className="text-emerald-700 text-xs mr-2">المستخلص</Link>}</td></tr>
              ))}</tbody>
            </table>
          </div>
          <div className="card overflow-x-auto">
            <h2 className="font-semibold p-4 pb-0">المتجاهَلة</h2>
            <table className="table">
              <thead><tr><th>المقاول</th><th>نوع العمل</th><th>المشروع</th><th>الإجمالي</th><th></th></tr></thead>
              <tbody>{ignored.map((c) => (
                <tr key={c.id}><td>{c.contractorRaw}</td><td>{c.workTypeRaw}</td><td>{c.projectRaw}</td><td className="num">{money(c.total)}</td>
                  <td><form action={restoreLegacyAction}><input type="hidden" name="legacyId" value={c.id} /><button className="btn-secondary btn-sm">استرجاع</button></form></td></tr>
              ))}</tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function Tab({ href, active, label }: { href: string; active: boolean; label: string }) {
  return <Link href={href} className={`px-3 py-2 text-sm border-b-2 -mb-px ${active ? "border-emerald-700 text-emerald-800 font-semibold" : "border-transparent text-stone-500 hover:text-stone-800"}`}>{label}</Link>;
}

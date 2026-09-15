import Link from "next/link";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireAdmin } from "@/lib/auth";
import { pendingLegacy, allAccountsLite, candidates, legacyItems } from "@/lib/queries/reconciliation";
import { lookups } from "@/lib/queries/accounts";
import { money, fmtDate, CATEGORY_LABEL } from "@/lib/format";
import { linkLegacyAction, ignoreLegacyAction, restoreLegacyAction, setLegacyProjectAction, resolveAccountAction } from "@/app/actions/reconciliation";
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
        <Tab href="/reconciliation?tab=legacy" active={tab === "legacy"} label={`أوراق إسلام القديمة — بانتظار الربط (${pending.length})`} />
        <Tab href="/reconciliation?tab=accounts" active={tab === "accounts"} label={`حسابات فيها ملاحظة (${flagged.length})`} />
        <Tab href="/reconciliation?tab=done" active={tab === "done"} label={`المربوطة (${linked.length}) · المؤجّلة (${ignored.length})`} />
      </div>

      {tab === "legacy" && (
        <div className="space-y-3">
          <div className="card p-4 bg-emerald-50 border-emerald-200 text-sm leading-relaxed">
            <b>وش المطلوب هنا؟</b> كل بطاقة تحت هي ورقة مستخلص قديمة من إسلام. السؤال الوحيد: <b>هذي الورقة تخص أي حساب في الصندوق؟</b><br />
            • إذا أحد الأزرار الخضراء صح → اضغطه وخلاص. الربط <b>ينسخ بنود الأعمال كوصف للحساب فقط</b> — ما يغيّر أي مبلغ؛ المبالغ كلها من الصندوق.<br />
            • إذا المقاول ما له ورقة صندوق بعد → «أجّل» حتى تصل ورقته وتُستورد، ثم ارجع واربطها.
          </div>
          <datalist id="all-accounts">{accountOptions.map((a) => <option key={a.id} value={`#${a.id} · ${a.party} — ${a.title} (${a.project})`} />)}</datalist>
          {pending.length === 0 && <p className="card p-6 text-center text-stone-500">🎉 كل مستخلصات إسلام مربوطة.</p>}
          {pending.map((c) => {
            const items = legacyItems(c);
            const cands = candidates({ projectId: c.projectId, contractorRaw: c.contractorRaw, workTypeRaw: c.workTypeRaw, date: c.date, previousPaid: c.previousPaid, total: c.total }, accounts).slice(0, 3);
            return (
              <div key={c.id} className="card p-4">
                <div className="flex flex-wrap justify-between gap-2 items-start">
                  <div>
                    <div className="text-xs text-stone-500">ورقة إسلام</div>
                    <div className="font-bold text-xl">{c.contractorRaw || "—"} <span className="text-stone-500 font-normal text-base">· {c.workTypeRaw || "—"}</span></div>
                    <div className="text-sm text-stone-600 mt-1">
                      المشروع: {c.project ? <b>{c.project.name}</b> : <span className="text-red-600 font-semibold">غير معروف («{c.projectRaw}»)</span>}
                      <span className="mx-2">·</span> التاريخ: <span className="num">{c.date ? fmtDate(c.date) : (c.dateRaw || "—")}</span>
                    </div>
                  </div>
                  <div className="text-sm text-left bg-stone-50 rounded-lg px-3 py-2">
                    <div>إجمالي الأعمال: <b className="num">{money(c.total)}</b></div>
                    <div>سبق صرفه (حسب إسلام): <b className="num">{money(c.previousPaid)}</b></div>
                  </div>
                </div>

                <div className="mt-4 text-sm font-semibold text-stone-700">هذي الورقة تخص أي حساب في الصندوق؟</div>
                <div className="mt-2 grid gap-2">
                  {cands.map((k) => (
                    <form key={k.accountId} action={linkLegacyAction}>
                      <input type="hidden" name="legacyId" value={c.id} /><input type="hidden" name="accountId" value={k.accountId} />
                      <button className="w-full text-right rounded-lg border-2 border-emerald-600 bg-white hover:bg-emerald-50 px-4 py-3 transition">
                        <div className="font-bold text-emerald-800">✔ {k.party} — {k.title}</div>
                        <div className="text-xs text-stone-600 mt-0.5">{k.project} · {k.workType} · مصروف من الصندوق <span className="num">{money(k.paid)}</span>{k.paidBefore !== k.paid ? <> (حتى تاريخ الورقة <span className="num">{money(k.paidBefore)}</span>)</> : null}</div>
                        <div className="text-xs text-emerald-700 mt-0.5">لماذا مرشّح: {k.reasons.join("، ")}</div>
                      </button>
                    </form>
                  ))}
                  {cands.length === 0 && <p className="text-sm text-stone-500 rounded-lg border border-dashed border-stone-300 px-4 py-3">ما لقيت حساب مشابه بالصندوق — غالباً ورقة صندوقه ما وصلت بعد، فاضغط «أجّل».</p>}
                  <div className="flex flex-wrap gap-2 items-end">
                    <form action={ignoreLegacyAction}><input type="hidden" name="legacyId" value={c.id} /><ConfirmButton className="btn-secondary" message="تأجيل هذه الورقة حتى تصل ورقة الصندوق؟ (تسترجعها من تبويب المؤجّلة)">أجّل — ما له ورقة صندوق بعد</ConfirmButton></form>
                  </div>
                </div>

                <Details title={`بنود الورقة (${items.length}) · خيارات إضافية`} className="mt-3 border-stone-100! shadow-none!">
                  <table className="table text-xs mb-3">
                    <thead><tr><th>البيان</th><th>الوحدة</th><th>سابق</th><th>حالي</th><th>جملة</th><th>السعر</th><th>القيمة</th></tr></thead>
                    <tbody>{items.map((it, i) => <tr key={i}><td>{it.description}</td><td>{it.unit}</td><td className="num">{it.prevQty ?? "—"}</td><td className="num">{it.currentQty ?? "—"}</td><td className="num">{it.totalQty ?? "—"}</td><td className="num">{it.price ?? "—"}</td><td className="num">{money(it.amount)}</td></tr>)}</tbody>
                  </table>
                  <form action={linkLegacyAction} className="flex gap-2 items-end">
                    <input type="hidden" name="legacyId" value={c.id} />
                    <div className="flex-1"><label className="label">ربط بحساب آخر غير المرشحين (اكتب اسم المقاول واختر)</label><input name="accountPick" list="all-accounts" className="input" placeholder="اكتب هنا…" /></div>
                    <button className="btn-secondary">ربط</button>
                  </form>
                  {!c.projectId && (
                    <form action={setLegacyProjectAction} className="flex gap-2 items-end mt-2">
                      <input type="hidden" name="legacyId" value={c.id} />
                      <div className="flex-1"><label className="label">تصحيح مشروع الورقة فقط (بدون ربط)</label><select name="projectId" className="input" defaultValue=""><option value="">—</option>{opts.projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></div>
                      <button className="btn-secondary">حفظ</button>
                    </form>
                  )}
                </Details>
              </div>
            );
          })}
        </div>
      )}

      {tab === "accounts" && (
        <div className="space-y-3">
          <div className="card p-4 bg-amber-50 border-amber-200 text-sm leading-relaxed">
            <b>وش المطلوب هنا؟</b> حسابات علّمها الاستيراد بملاحظة (مثلاً: أي مسجد؟ أو مجموع لا يطابق). اقرأ السبب، صحّح المشروع أو الجهة إذا لزم، ثم اضغط <b>«تم»</b> عشان تختفي. ما فيه شي إجباري — الأرقام محسوبة سواء راجعتها أو لا.
          </div>
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
        </div>
      )}

      {tab === "done" && (
        <div className="space-y-4">
          <div className="card overflow-x-auto">
            <h2 className="font-semibold p-4 pb-0">المربوطة</h2>
            <table className="table">
              <thead><tr><th>المقاول</th><th>نوع العمل</th><th>التاريخ</th><th>الإجمالي</th><th>وصفها على حساب</th></tr></thead>
              <tbody>{linked.map((c) => (
                <tr key={c.id}><td>{c.contractorRaw}</td><td>{c.workTypeRaw}</td><td className="num">{fmtDate(c.date)}</td><td className="num">{money(c.total)}</td>
                  <td>{c.linkedAccount ? <Link href={`/accounts/${c.linkedAccount.id}`} className="hover:underline">{c.linkedAccount.title}</Link> : "—"}</td></tr>
              ))}</tbody>
            </table>
          </div>
          <div className="card overflow-x-auto">
            <h2 className="font-semibold p-4 pb-0">المؤجّلة — بانتظار ورقة الصندوق</h2>
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

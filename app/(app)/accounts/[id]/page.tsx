import Link from "next/link";
import { notFound } from "next/navigation";
import { getAccount, lookups } from "@/lib/queries/accounts";
import { requireUser } from "@/lib/auth";
import { money, fmtDate, today, CATEGORY_LABEL } from "@/lib/format";
import { addPaymentAction, deletePaymentAction, addItemAction, updateItemAction, deleteItemAction, updateAccountAction, deleteAccountAction } from "@/app/actions/accounts";
import { ConfirmButton } from "@/app/(app)/confirm-button";
import { Details } from "@/app/(app)/details";

export default async function AccountPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  const [acc, opts] = await Promise.all([getAccount(Number(id)), lookups()]);
  if (!acc) notFound();
  const paid = acc.payments.reduce((s, p) => s + p.amount, 0);
  const works = acc.items.filter((i) => i.active).reduce((s, i) => s + i.cumQty * i.price, 0);
  const activeItems = acc.items.filter((i) => i.active);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-sm text-stone-500"><Link href="/accounts" className="hover:underline">الحسابات</Link> / {acc.project.name}</div>
          <h1 className="text-2xl font-bold mt-1">{acc.title}</h1>
          <div className="text-sm text-stone-600 mt-1 flex flex-wrap gap-x-4 gap-y-1">
            <span>الجهة: <Link href={`/accounts?party=${acc.party.id}`} className="font-medium hover:underline">{acc.party.name}</Link> <span className="text-stone-400">({CATEGORY_LABEL[acc.party.category]}{acc.party.phone ? ` · ${acc.party.phone}` : ""})</span></span>
            <span>نوع العمل: <span className="font-medium">{acc.workType?.name ?? "—"}</span></span>
            <span>{acc.status === "closed" ? <span className="badge bg-stone-100 text-stone-600">خالص</span> : <span className="badge bg-emerald-50 text-emerald-700">جاري</span>}</span>
          </div>
          {acc.needsReview && <div className="mt-2 text-sm bg-amber-50 border border-amber-200 text-amber-800 rounded-lg px-3 py-2">⚠ يحتاج مراجعة: {acc.reviewNote || "—"}</div>}
        </div>
        <div className="flex gap-2 no-print">
          <Link href={`/certificates/new?account=${acc.id}`} className="btn-primary">+ مستخلص لهذا الحساب</Link>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat label="المصروف من الصندوق" value={money(paid)} sub={`${acc.payments.length} دفعة`} />
        <Stat label="قيمة الأعمال المعتمدة" value={money(works)} sub={`${activeItems.length} بند`} />
        <Stat label="المتبقي للمقاول" value={money(works - paid)} sub={works ? (works - paid >= 0 ? "مستحق له" : "زائد عن الأعمال") : "بعد إدخال البنود"} />
        <Stat label="المستخلصات" value={String(acc.certificates.length)} sub={acc.certificates[0] ? `آخرها ${fmtDate(acc.certificates[0].date)}` : "—"} />
      </div>

      {/* Items */}
      <section className="card p-4">
        <h2 className="font-semibold mb-3">بنود الأعمال (تراكمي)</h2>
        <div className="overflow-x-auto">
          <table className="table">
            <thead><tr><th>م</th><th className="w-1/2">البيان</th><th>الوحدة</th><th>السعر</th><th>الكمية المعتمدة</th><th>القيمة</th><th className="no-print"></th></tr></thead>
            <tbody>
              {activeItems.map((it, i) => (
                <tr key={it.id}>
                  <td className="num">{i + 1}</td>
                  <td colSpan={4} className="p-0">
                    <form action={updateItemAction} className="grid grid-cols-[1fr_80px_100px_110px] gap-1 px-2 py-1 items-center">
                      <input type="hidden" name="itemId" value={it.id} /><input type="hidden" name="accountId" value={acc.id} />
                      <input name="description" defaultValue={it.description} className="input py-1!" />
                      <input name="unit" defaultValue={it.unit} className="input py-1! text-center" />
                      <input name="price" defaultValue={it.price} className="input py-1! num" />
                      <input name="cumQty" defaultValue={it.cumQty} className="input py-1! num" />
                      <button className="hidden" type="submit">حفظ</button>
                    </form>
                  </td>
                  <td className="num font-medium">{money(it.cumQty * it.price)}</td>
                  <td className="no-print"><form action={deleteItemAction}><input type="hidden" name="itemId" value={it.id} /><input type="hidden" name="accountId" value={acc.id} /><ConfirmButton className="text-red-600 text-xs hover:underline" message="حذف البند؟">حذف</ConfirmButton></form></td>
                </tr>
              ))}
              {activeItems.length === 0 && <tr><td colSpan={7} className="text-center text-stone-500 py-4">لا توجد بنود بعد — أضفها هنا أو اربط مستخلص إسلام من صفحة المطابقة.</td></tr>}
            </tbody>
            <tfoot>
              <tr>
                <td></td>
                <td colSpan={4} className="p-0">
                  <form action={addItemAction} className="grid grid-cols-[1fr_80px_100px_110px] gap-1 px-2 py-1 items-center no-print">
                    <input type="hidden" name="accountId" value={acc.id} />
                    <input name="description" placeholder="بند جديد…" className="input py-1!" required />
                    <input name="unit" placeholder="م2" className="input py-1! text-center" />
                    <input name="price" placeholder="السعر" className="input py-1! num" />
                    <input name="cumQty" placeholder="الكمية" className="input py-1! num" />
                  </form>
                </td>
                <td className="num font-bold">{money(works)}</td>
                <td className="no-print"><button form="" className="hidden" /></td>
              </tr>
            </tfoot>
          </table>
        </div>
        <p className="text-xs text-stone-400 mt-2 no-print">تعديل أي خلية ثم Enter يحفظها. الكمية المعتمدة = مجموع ما اعتُمد في المستخلصات حتى الآن.</p>
      </section>

      {/* Payments */}
      <section className="card p-4">
        <h2 className="font-semibold mb-3">دفعات الصندوق</h2>
        <div className="overflow-x-auto">
          <table className="table">
            <thead><tr><th>م</th><th>البيان</th><th>التاريخ</th><th>المبلغ</th><th>طريقة الدفع</th><th>رقم السند</th><th>ملاحظة</th><th className="no-print"></th></tr></thead>
            <tbody>
              {acc.payments.map((p, i) => (
                <tr key={p.id} className={p.isOpening ? "bg-amber-50/50" : ""}>
                  <td className="num">{i + 1}</td>
                  <td>{p.label}</td>
                  <td className="num">{p.date ? fmtDate(p.date) : <span className="text-red-600" title={p.dateRaw}>غير مقروء: {p.dateRaw || "—"}</span>}</td>
                  <td className="num font-medium">{money(p.amount)}</td>
                  <td>{p.method || "—"}</td>
                  <td className="num">{p.voucher || "—"}</td>
                  <td className="text-stone-500 text-xs">{p.note}</td>
                  <td className="no-print"><form action={deletePaymentAction}><input type="hidden" name="paymentId" value={p.id} /><input type="hidden" name="accountId" value={acc.id} /><ConfirmButton className="text-red-600 text-xs hover:underline" message="حذف الدفعة؟">حذف</ConfirmButton></form></td>
                </tr>
              ))}
            </tbody>
            <tfoot><tr><td colSpan={3} className="font-bold">الإجمالي</td><td className="num font-bold">{money(paid)}</td><td colSpan={4}></td></tr></tfoot>
          </table>
        </div>
        <form action={addPaymentAction} className="no-print mt-3 grid grid-cols-2 md:grid-cols-7 gap-2 items-end border-t border-stone-100 pt-3">
          <input type="hidden" name="accountId" value={acc.id} />
          <div className="col-span-2"><label className="label">البيان</label><input name="label" className="input" placeholder={`دفعة ${acc.payments.length + 1} من الحساب`} /></div>
          <div><label className="label">التاريخ</label><input type="date" name="date" defaultValue={today()} className="input" /></div>
          <div><label className="label">المبلغ</label><input name="amount" className="input num" required inputMode="decimal" /></div>
          <div><label className="label">طريقة الدفع</label><select name="method" className="input"><option value="نقداً">نقداً</option><option value="تحويل">تحويل</option><option value="شيك">شيك</option><option value="فاتورة">فاتورة</option></select></div>
          <div><label className="label">رقم السند</label><input name="voucher" className="input num" /></div>
          <div><button className="btn-primary w-full">+ إضافة دفعة</button></div>
        </form>
      </section>

      {/* Certificates */}
      <section className="card p-4">
        <h2 className="font-semibold mb-3">المستخلصات</h2>
        {acc.certificates.length === 0 ? <p className="text-sm text-stone-500">لا توجد مستخلصات لهذا الحساب.</p> : (
          <table className="table">
            <thead><tr><th>رقم</th><th>التاريخ</th><th>الحالة</th><th>الإجمالي</th><th>سبق صرفه</th><th>المستحق</th><th></th></tr></thead>
            <tbody>{acc.certificates.map((c) => (
              <tr key={c.id}>
                <td className="num">{c.number}</td><td className="num">{fmtDate(c.date)}</td>
                <td>{c.status === "approved" ? <span className="badge bg-emerald-50 text-emerald-700">معتمد</span> : <span className="badge bg-amber-50 text-amber-700">مسودة</span>}{c.source === "legacy" && <span className="badge bg-stone-100 text-stone-600 mr-1">قديم</span>}</td>
                <td className="num">{money(c.total)}</td><td className="num">{money(c.previousPaid)}</td><td className="num font-medium">{money(c.due)}</td>
                <td><Link href={`/certificates/${c.id}`} className="text-emerald-700 hover:underline text-sm">فتح</Link></td>
              </tr>
            ))}</tbody>
          </table>
        )}
      </section>

      {/* Edit account */}
      <Details title="تعديل بيانات الحساب" className="no-print">
        <form action={updateAccountAction} className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <input type="hidden" name="accountId" value={acc.id} />
          <div className="col-span-2"><label className="label">اسم الحساب</label><input name="title" defaultValue={acc.title} className="input" /></div>
          <div><label className="label">المشروع</label><select name="projectId" defaultValue={acc.projectId} className="input">{opts.projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></div>
          <div><label className="label">الحالة</label><select name="status" defaultValue={acc.status} className="input"><option value="open">جاري</option><option value="closed">خالص</option></select></div>
          <div className="col-span-2"><label className="label">الجهة</label><select name="partyId" defaultValue={acc.partyId} className="input">{opts.parties.map((p) => <option key={p.id} value={p.id}>{p.name} ({CATEGORY_LABEL[p.category]})</option>)}</select></div>
          <div><label className="label">نوع العمل</label><select name="workTypeId" defaultValue={acc.workTypeId ?? ""} className="input">{opts.workTypes.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}</select></div>
          <div className="flex items-end pb-2"><label className="flex items-center gap-2 text-sm"><input type="checkbox" name="needsReview" defaultChecked={acc.needsReview} /> يحتاج مراجعة</label></div>
          <div className="col-span-2"><label className="label">ملاحظة المراجعة</label><input name="reviewNote" defaultValue={acc.reviewNote} className="input" /></div>
          <div className="col-span-2"><label className="label">ملاحظات</label><input name="notes" defaultValue={acc.notes} className="input" /></div>
          <div className="col-span-2 md:col-span-4 flex justify-between items-center">
            <span className="text-xs text-stone-400">المصدر: {acc.sourceFile ? `${acc.sourceFile} › ${acc.sourceSheet}` : "أُنشئ في النظام"}</span>
            <button className="btn-primary">حفظ التعديلات</button>
          </div>
        </form>
        {user.role === "admin" && (
          <form action={deleteAccountAction} className="mt-3 border-t border-stone-100 pt-3">
            <input type="hidden" name="accountId" value={acc.id} />
            <ConfirmButton className="btn-danger btn-sm" message="حذف الحساب مع كل دفعاته وبنوده ومستخلصاته؟ لا يمكن التراجع.">حذف الحساب نهائياً</ConfirmButton>
          </form>
        )}
      </Details>
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="card p-4">
      <div className="text-xs text-stone-500">{label}</div>
      <div className="mt-1 text-lg font-bold num">{value}</div>
      {sub && <div className="text-xs text-stone-500 mt-1">{sub}</div>}
    </div>
  );
}

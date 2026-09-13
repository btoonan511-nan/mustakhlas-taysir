import Link from "next/link";
import { listAccounts, lookups } from "@/lib/queries/accounts";
import { money, fmtDate, CATEGORY_LABEL } from "@/lib/format";
import { AccountFilters } from "./account-filters";

type Search = Record<string, string | string[] | undefined>;
const num = (v: string | string[] | undefined) => { const n = Number(Array.isArray(v) ? v[0] : v); return Number.isFinite(n) && n > 0 ? n : undefined; };
const str = (v: string | string[] | undefined) => { const s = Array.isArray(v) ? v[0] : v; return s?.trim() || undefined; };

export default async function AccountsPage({ searchParams }: { searchParams: Promise<Search> }) {
  const sp = await searchParams;
  const f = { q: str(sp.q), projectId: num(sp.project), partyId: num(sp.party), workTypeId: num(sp.work), category: str(sp.category), status: str(sp.status), review: sp.review === "1" };
  const [rows, opts] = await Promise.all([listAccounts(f), lookups()]);
  const totalPaid = rows.reduce((s, r) => s + r.paid, 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">الحسابات</h1>
          <p className="text-sm text-stone-500">{rows.length} حساب · إجمالي المصروف <span className="num font-medium">{money(totalPaid)}</span></p>
        </div>
        <div className="flex gap-2">
          <Link href="/accounts/new" className="btn-secondary">+ حساب جديد</Link>
          <Link href="/payments/new" className="btn-primary">+ دفعة</Link>
        </div>
      </div>

      <AccountFilters options={opts} current={{ q: f.q ?? "", project: f.projectId ? String(f.projectId) : "", party: f.partyId ? String(f.partyId) : "", work: f.workTypeId ? String(f.workTypeId) : "", category: f.category ?? "", status: f.status ?? "", review: f.review ? "1" : "" }} />

      <div className="card overflow-x-auto">
        <table className="table">
          <thead><tr><th>الحساب</th><th>الجهة</th><th>المشروع</th><th>نوع العمل</th><th>المصروف</th><th>الدفعات</th><th>آخر دفعة</th><th>الحالة</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td>
                  <Link href={`/accounts/${r.id}`} className="font-medium hover:underline">{r.title}</Link>
                  {r.needsReview && <span className="badge bg-amber-100 text-amber-800 mr-2" title={r.reviewNote}>مراجعة</span>}
                </td>
                <td><Link href={`/accounts?party=${r.partyId}`} className="hover:underline">{r.party}</Link> <span className="text-xs text-stone-400">{CATEGORY_LABEL[r.category]}</span></td>
                <td>{r.project}</td>
                <td className="text-stone-600">{r.workType ?? "—"}</td>
                <td className="num font-semibold">{money(r.paid)}</td>
                <td className="num">{r.paymentCount}</td>
                <td className="num">{fmtDate(r.lastPayment)}</td>
                <td>{r.status === "closed" ? <span className="badge bg-stone-100 text-stone-600">خالص</span> : <span className="badge bg-emerald-50 text-emerald-700">جاري</span>}</td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={8} className="text-center text-stone-500 py-6">لا توجد حسابات مطابقة</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

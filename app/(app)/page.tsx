import Link from "next/link";
import { dashboard, filterOptions, type DashboardFilters } from "@/lib/queries/dashboard";
import { money, fmtDate, CATEGORY_LABEL } from "@/lib/format";
import { FilterBar } from "./filter-bar";

type Search = Record<string, string | string[] | undefined>;

function num(v: string | string[] | undefined) { const n = Number(Array.isArray(v) ? v[0] : v); return Number.isFinite(n) && n > 0 ? n : undefined; }
function str(v: string | string[] | undefined) { const s = Array.isArray(v) ? v[0] : v; return s?.trim() || undefined; }

export default async function DashboardPage({ searchParams }: { searchParams: Promise<Search> }) {
  const sp = await searchParams;
  const f: DashboardFilters = { from: str(sp.from), to: str(sp.to), projectId: num(sp.project), partyId: num(sp.party), workTypeId: num(sp.work), category: str(sp.category) };
  const [data, options] = await Promise.all([dashboard(f), filterOptions()]);
  const s = data.summary;
  const topParty = data.byParty[0];
  const topProject = data.byProject[0];
  const topWork = data.byWorkType[0];
  const topItem = data.topItems[0];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">لوحة التحليل</h1>
          <p className="text-sm text-stone-500">الفترة: {fmtDate(s.minDate)} — {fmtDate(s.maxDate)}</p>
        </div>
        <Link href="/certificates/new" className="btn-primary">+ مستخلص جديد</Link>
      </div>

      <FilterBar options={options} current={{ from: f.from ?? "", to: f.to ?? "", project: f.projectId ? String(f.projectId) : "", party: f.partyId ? String(f.partyId) : "", work: f.workTypeId ? String(f.workTypeId) : "", category: f.category ?? "" }} />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat label="إجمالي المصروف" value={money(s.total)} sub={`${s.payments} دفعة`} big />
        <Stat label="الحسابات" value={String(s.accounts)} sub={`${s.parties} جهة · ${s.projects} مشروع`} />
        <Stat label="أعلى مشروع" value={topProject?.name ?? "—"} sub={topProject ? money(topProject.total) : ""} />
        <Stat label="أعلى جهة" value={topParty?.name ?? "—"} sub={topParty ? money(topParty.total) : ""} />
        <Stat label="أعلى نوع عمل" value={topWork?.name ?? "—"} sub={topWork ? money(topWork.total) : ""} />
        <Stat label="أعلى بند أعمال" value={topItem?.description ?? "—"} sub={topItem ? money(topItem.value) : "بعد ربط المستخلصات"} />
        {data.byCategory.map((c) => (
          <Stat key={c.category} label={`مصروف ${CATEGORY_LABEL[c.category] ?? c.category}`} value={money(c.total)} sub={`${c.payments} دفعة`} />
        ))}
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <Panel title="حسب المشروع">
          <Bars rows={data.byProject.map((r) => ({ label: r.name, value: r.total, href: `/?project=${r.id}`, sub: `${r.accounts} حساب` }))} />
        </Panel>
        <Panel title="أعلى الجهات (مقاولين وموردين)">
          <Bars rows={data.byParty.map((r) => ({ label: r.name, value: r.total, href: `/accounts?party=${r.id}`, sub: CATEGORY_LABEL[r.category] }))} />
        </Panel>
        <Panel title="حسب نوع العمل">
          <Bars rows={data.byWorkType.map((r) => ({ label: r.name, value: r.total, href: r.id ? `/?work=${r.id}` : undefined, sub: `${r.payments} دفعة` }))} />
        </Panel>
        <Panel title="حسب السنة">
          <Bars rows={data.byYear.map((r) => ({ label: r.year, value: r.total, href: `/?from=${r.year}-01-01&to=${r.year}-12-31`, sub: `${r.payments} دفعة` }))} />
        </Panel>
      </div>

      <Panel title="المصروف الشهري">
        <MonthChart rows={data.byMonth} />
      </Panel>

      <div className="grid md:grid-cols-2 gap-4">
        <Panel title="أعلى بنود الأعمال (من المستخلصات)">
          {data.topItems.length === 0 ? <Empty text="تظهر بعد ربط مستخلصات إسلام بالحسابات من صفحة المطابقة." /> : (
            <table className="table">
              <thead><tr><th>البند</th><th>الوحدة</th><th>الكمية</th><th>القيمة</th></tr></thead>
              <tbody>{data.topItems.map((r, i) => (
                <tr key={i}><td>{r.description}</td><td>{r.unit || "—"}</td><td className="num">{money(r.qty)}</td><td className="num font-semibold">{money(r.value)}</td></tr>
              ))}</tbody>
            </table>
          )}
        </Panel>
        <Panel title="أكبر الدفعات">
          <table className="table">
            <thead><tr><th>التاريخ</th><th>الجهة</th><th>المشروع</th><th>المبلغ</th></tr></thead>
            <tbody>{data.topPayments.map((r) => (
              <tr key={r.payments.id}>
                <td className="num">{fmtDate(r.payments.date)}</td>
                <td><Link className="hover:underline" href={`/accounts/${r.accounts.id}`}>{r.parties.name}</Link></td>
                <td>{r.projects.name}</td>
                <td className="num font-semibold">{money(r.payments.amount)}</td>
              </tr>
            ))}</tbody>
          </table>
        </Panel>
      </div>
    </div>
  );
}

function Stat({ label, value, sub, big }: { label: string; value: string; sub?: string; big?: boolean }) {
  return (
    <div className={`card p-4 ${big ? "bg-emerald-800 text-white border-emerald-800" : ""}`}>
      <div className={`text-xs ${big ? "text-emerald-100" : "text-stone-500"}`}>{label}</div>
      <div className={`mt-1 font-bold truncate ${big ? "text-2xl" : "text-lg"} ${/^[\d.,\s—ألفم]+$/.test(value) ? "num" : ""}`} title={value}>{value}</div>
      {sub && <div className={`text-xs mt-1 ${big ? "text-emerald-100" : "text-stone-500"}`}>{sub}</div>}
    </div>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="card p-4 overflow-x-auto">
      <h2 className="font-semibold mb-3">{title}</h2>
      {children}
    </section>
  );
}

function Empty({ text }: { text: string }) { return <p className="text-sm text-stone-500 py-4 text-center">{text}</p>; }

function Bars({ rows }: { rows: { label: string; value: number; sub?: string; href?: string }[] }) {
  if (!rows.length) return <Empty text="لا توجد بيانات" />;
  const max = Math.max(...rows.map((r) => r.value), 1);
  return (
    <ul className="space-y-2">
      {rows.map((r, i) => (
        <li key={i} className="text-sm">
          <div className="flex justify-between gap-2 mb-1">
            <span className="truncate">{r.href ? <Link className="hover:underline" href={r.href}>{r.label}</Link> : r.label}{r.sub && <span className="text-stone-400 text-xs mr-2">{r.sub}</span>}</span>
            <span className="num font-medium whitespace-nowrap">{money(r.value)}</span>
          </div>
          <div className="h-2 rounded bg-stone-100 overflow-hidden"><div className="h-full bg-emerald-600 rounded" style={{ width: `${Math.max(2, (r.value / max) * 100)}%` }} /></div>
        </li>
      ))}
    </ul>
  );
}

function MonthChart({ rows }: { rows: { month: string; total: number; payments: number }[] }) {
  if (!rows.length) return <Empty text="لا توجد بيانات" />;
  const max = Math.max(...rows.map((r) => r.total), 1);
  return (
    <div className="overflow-x-auto">
      <div className="flex items-end gap-1 h-40 min-w-[600px]" dir="ltr">
        {rows.map((r) => (
          <Link key={r.month} href={`/?from=${r.month}-01&to=${r.month}-31`} className="flex-1 flex flex-col items-center justify-end h-full group" title={`${r.month}: ${money(r.total)} (${r.payments} دفعة)`}>
            <div className="w-full bg-emerald-500 group-hover:bg-emerald-700 rounded-t" style={{ height: `${Math.max(1, (r.total / max) * 100)}%` }} />
          </Link>
        ))}
      </div>
      <div className="flex gap-1 min-w-[600px] mt-1 text-[10px] text-stone-500" dir="ltr">
        {rows.map((r, i) => <div key={r.month} className="flex-1 text-center">{i % Math.ceil(rows.length / 12) === 0 ? r.month : ""}</div>)}
      </div>
    </div>
  );
}

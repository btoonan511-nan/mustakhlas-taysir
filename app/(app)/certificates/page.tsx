import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { money, fmtDate } from "@/lib/format";

export default async function CertificatesPage() {
  const { certificates, accounts, parties, projects } = schema;
  const rows = await db.select({
    id: certificates.id, number: certificates.number, date: certificates.date, status: certificates.status, source: certificates.source,
    total: certificates.total, previousPaid: certificates.previousPaid, due: certificates.due,
    accountId: accounts.id, title: accounts.title, party: parties.name, project: projects.name,
  }).from(certificates)
    .innerJoin(accounts, eq(certificates.accountId, accounts.id))
    .innerJoin(parties, eq(accounts.partyId, parties.id))
    .innerJoin(projects, eq(accounts.projectId, projects.id))
    .orderBy(desc(certificates.date), desc(certificates.id));

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between">
        <div><h1 className="text-2xl font-bold">المستخلصات</h1><p className="text-sm text-stone-500">{rows.length} مستخلص</p></div>
        <Link href="/certificates/new" className="btn-primary">+ مستخلص جديد</Link>
      </div>
      <div className="card overflow-x-auto">
        <table className="table">
          <thead><tr><th>التاريخ</th><th>المقاول</th><th>الحساب</th><th>المشروع</th><th>رقم</th><th>الإجمالي</th><th>سبق صرفه</th><th>المستحق</th><th>الحالة</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="num">{fmtDate(r.date)}</td>
                <td className="font-medium">{r.party}</td>
                <td><Link href={`/certificates/${r.id}`} className="hover:underline">{r.title}</Link></td>
                <td>{r.project}</td>
                <td className="num">{r.number}</td>
                <td className="num">{money(r.total)}</td>
                <td className="num">{money(r.previousPaid)}</td>
                <td className="num font-semibold">{money(r.due)}</td>
                <td>{r.status === "approved" ? <span className="badge bg-emerald-50 text-emerald-700">معتمد</span> : <span className="badge bg-amber-50 text-amber-700">مسودة</span>}{r.source === "legacy" && <span className="badge bg-stone-100 text-stone-600 mr-1">قديم</span>}</td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={9} className="text-center text-stone-500 py-6">لا توجد مستخلصات بعد.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

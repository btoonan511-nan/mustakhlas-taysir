import Link from "next/link";
import { notFound } from "next/navigation";
import { eq, asc } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireUser } from "@/lib/auth";
import { money, qty, fmtDate } from "@/lib/format";
import { approveCertificateAction, unapproveCertificateAction, deleteCertificateAction } from "@/app/actions/certificates";
import { ConfirmButton } from "@/app/(app)/confirm-button";
import { PrintButton } from "../print-button";
import { CertificateEditor } from "../editor";

export default async function CertificatePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ edit?: string }> }) {
  const { id } = await params;
  const { edit } = await searchParams;
  const user = await requireUser();
  const cert = await db.query.certificates.findFirst({
    where: eq(schema.certificates.id, Number(id)),
    with: { items: { orderBy: [asc(schema.certificateItems.sort)] }, account: { with: { project: true, party: true, workType: true, payments: true, certificates: true } } },
  });
  if (!cert) notFound();
  const acc = cert.account;
  const paid = acc.payments.reduce((s, p) => s + p.amount, 0);

  if (edit && cert.status === "draft") {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold">تعديل المستخلص رقم {cert.number} — {acc.title}</h1>
        <CertificateEditor
          cert={{ id: cert.id, accountId: acc.id, date: cert.date, notes: cert.notes, previousPaid: cert.previousPaid, deductions: cert.deductions,
            items: cert.items.map((i) => ({ accountItemId: i.accountItemId, description: i.description, unit: i.unit, prevQty: i.prevQty, currentQty: i.currentQty, price: i.price, note: i.note })) }}
          meta={{ project: acc.project.name, party: acc.party.name, phone: acc.party.phone, workType: acc.workType?.name ?? "", paidFromCashbox: paid, certCount: cert.number - 1 }}
        />
      </div>
    );
  }

  const d = fmtDate(cert.date).split("/"); // dd/mm/yyyy
  const blankRows = Math.max(0, 8 - cert.items.length);

  return (
    <div className="space-y-4">
      <div className="no-print flex flex-wrap items-center justify-between gap-3">
        <div className="text-sm text-stone-500"><Link href="/certificates" className="hover:underline">المستخلصات</Link> / <Link href={`/accounts/${acc.id}`} className="hover:underline">{acc.title}</Link></div>
        <div className="flex flex-wrap gap-2 items-center">
          {cert.status === "approved" ? <span className="badge bg-emerald-50 text-emerald-700">معتمد</span> : <span className="badge bg-amber-50 text-amber-700">مسودة</span>}
          {cert.status === "draft" && <Link href={`/certificates/${cert.id}?edit=1`} className="btn-secondary">تعديل</Link>}
          {cert.status === "draft" && <form action={approveCertificateAction}><input type="hidden" name="certificateId" value={cert.id} /><ConfirmButton className="btn-primary" message="اعتماد المستخلص؟ ستُحدَّث الكميات التراكمية للحساب.">اعتماد</ConfirmButton></form>}
          {cert.status === "approved" && user.role === "admin" && <form action={unapproveCertificateAction}><input type="hidden" name="certificateId" value={cert.id} /><ConfirmButton className="btn-secondary" message="إلغاء اعتماد المستخلص؟">إلغاء الاعتماد</ConfirmButton></form>}
          {cert.status === "draft" && <form action={deleteCertificateAction}><input type="hidden" name="certificateId" value={cert.id} /><ConfirmButton className="btn-danger" message="حذف المسودة؟">حذف</ConfirmButton></form>}
          <PrintButton />
        </div>
      </div>

      {/* Printable sheet — mirrors Islam's Word layout */}
      <div className="print-page card p-8 max-w-4xl mx-auto bg-white text-[13px] leading-relaxed">
        <div className="flex justify-between items-start">
          <div className="text-lg font-bold">مستخلص إسلام</div>
          <div className="text-center"><div className="text-xl font-bold">مشروع {acc.project.name}</div></div>
          <div className="text-xs text-stone-500 num">رقم {cert.number}</div>
        </div>
        <div className="mt-4 flex justify-between font-semibold">
          <div>مستخلص أعمال / {acc.workType?.name ?? acc.title}</div>
          <div>التاريخ : <span className="num">{d[0]}/ {d[1]} / {d[2]}</span></div>
        </div>
        <div className="mt-1 flex justify-between font-semibold">
          <div>المقاول / {acc.party.name}</div>
          <div>جوال / <span className="num">{acc.party.phone || "—"}</span></div>
        </div>

        <table className="w-full mt-4 border-collapse text-center [&_th]:border [&_th]:border-stone-800 [&_td]:border [&_td]:border-stone-800 [&_th]:px-2 [&_th]:py-1 [&_td]:px-2 [&_td]:py-1">
          <thead>
            <tr><th rowSpan={2} className="w-8">م</th><th rowSpan={2} className="text-right">بيان الأعمال</th><th rowSpan={2}>الوحدة</th><th colSpan={3}>الأعمال</th><th rowSpan={2}>السعر</th><th rowSpan={2}>قيمة الأعمال</th><th rowSpan={2} className="w-28">ملاحظات</th></tr>
            <tr><th>سابق</th><th>حالي</th><th>جملة</th></tr>
          </thead>
          <tbody>
            {cert.items.map((it, i) => (
              <tr key={it.id}>
                <td className="num">{i + 1}</td>
                <td className="text-right">{it.description}</td>
                <td>{it.unit || "—"}</td>
                <td className="num">{qty(it.prevQty)}</td>
                <td className="num">{qty(it.currentQty)}</td>
                <td className="num">{qty(it.totalQty)}</td>
                <td className="num">{money(it.price)}</td>
                <td className="num">{money(it.amount)}</td>
                <td className="text-xs">{it.note}</td>
              </tr>
            ))}
            {Array.from({ length: blankRows }).map((_, k) => (
              <tr key={`b${k}`}><td className="num">{cert.items.length + k + 1}</td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td></tr>
            ))}
            <tr><td colSpan={7} className="text-left font-bold">الإجمالي</td><td className="num font-bold">{money(cert.total)}</td><td></td></tr>
            <tr><td colSpan={7} className="text-left font-bold">ما سبق صرفه</td><td className="num">{cert.previousPaid ? money(cert.previousPaid) : "—"}</td><td></td></tr>
            {cert.deductions ? <tr><td colSpan={7} className="text-left font-bold">حسميات</td><td className="num">{money(cert.deductions)}</td><td></td></tr> : null}
            <tr><td colSpan={7} className="text-left font-bold">المستحق صرفه</td><td className="num font-bold text-base">{money(cert.due)}</td><td></td></tr>
          </tbody>
        </table>
        {cert.notes && <p className="mt-3 text-sm">ملاحظات: {cert.notes}</p>}
        <div className="mt-10 grid grid-cols-3 text-center font-semibold">
          <div>مهندس الموقع<div className="mt-8 border-t border-stone-400 mx-6"></div></div>
          <div>المحاسب<div className="mt-8 border-t border-stone-400 mx-6"></div></div>
          <div>المالك<div className="mt-8 border-t border-stone-400 mx-6"></div></div>
        </div>
      </div>

      <div className="no-print max-w-4xl mx-auto text-xs text-stone-500 flex flex-wrap gap-4">
        <span>المصروف الفعلي من الصندوق لهذا الحساب: <b className="num">{money(paid)}</b></span>
        {Math.abs(paid - cert.previousPaid) > 0.5 && <span className="text-amber-700">⚠ «ما سبق صرفه» المكتوب يختلف عن الصندوق بمقدار <b className="num">{money(cert.previousPaid - paid)}</b></span>}
        {cert.source === "legacy" && <span>مستورد من ملف Word القديم</span>}
      </div>
    </div>
  );
}

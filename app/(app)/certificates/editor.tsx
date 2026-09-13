"use client";

import { useMemo, useState, useTransition } from "react";
import { saveCertificateAction, type CertInput, type CertItemInput } from "@/app/actions/certificates";
import { money } from "@/lib/format";

type Meta = { project: string; party: string; phone: string; workType: string; paidFromCashbox: number; certCount: number };

const num = (v: string) => { const n = Number(String(v).replace(/[,٬\s]/g, "")); return Number.isFinite(n) ? n : 0; };

export function CertificateEditor({ cert, meta }: { cert: CertInput; meta: Meta }) {
  const [date, setDate] = useState(cert.date);
  const [notes, setNotes] = useState(cert.notes);
  const [previousPaid, setPreviousPaid] = useState(cert.previousPaid);
  const [deductions, setDeductions] = useState(cert.deductions);
  const [items, setItems] = useState<CertItemInput[]>(cert.items.length ? cert.items : [blank()]);
  const [pending, start] = useTransition();
  const [error, setError] = useState("");

  function blank(): CertItemInput { return { accountItemId: null, description: "", unit: "", prevQty: 0, currentQty: 0, price: 0, note: "" }; }
  const update = (i: number, patch: Partial<CertItemInput>) => setItems((list) => list.map((it, k) => (k === i ? { ...it, ...patch } : it)));
  const remove = (i: number) => setItems((list) => list.filter((_, k) => k !== i));

  const totals = useMemo(() => {
    const rows = items.map((it) => ({ totalQty: it.prevQty + it.currentQty, amount: (it.prevQty + it.currentQty) * it.price }));
    const total = rows.reduce((s, r) => s + r.amount, 0);
    return { rows, total, due: total - previousPaid - deductions };
  }, [items, previousPaid, deductions]);

  const submit = () => {
    setError("");
    start(async () => {
      try { await saveCertificateAction({ ...cert, date, notes, previousPaid, deductions, items }); }
      catch (e) {
        // Next.js signals redirect() by throwing — let it through
        if (e && typeof e === "object" && "digest" in e && String((e as { digest: unknown }).digest).startsWith("NEXT_REDIRECT")) throw e;
        setError(e instanceof Error ? e.message : "تعذر الحفظ");
      }
    });
  };

  return (
    <div className="space-y-4">
      <div className="card p-4 grid grid-cols-2 md:grid-cols-5 gap-3 text-sm">
        <div><div className="text-xs text-stone-500">المشروع</div><div className="font-semibold">{meta.project}</div></div>
        <div><div className="text-xs text-stone-500">المقاول</div><div className="font-semibold">{meta.party} <span className="text-stone-400 num">{meta.phone}</span></div></div>
        <div><div className="text-xs text-stone-500">مستخلص أعمال</div><div className="font-semibold">{meta.workType || "—"} <span className="text-stone-400">(رقم {meta.certCount + 1})</span></div></div>
        <div><label className="label">التاريخ</label><input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="input" /></div>
        <div><div className="text-xs text-stone-500">المصروف من الصندوق</div><div className="font-semibold num">{money(meta.paidFromCashbox)}</div></div>
      </div>

      <div className="card overflow-x-auto">
        <table className="table">
          <thead>
            <tr><th rowSpan={2}>م</th><th rowSpan={2} className="min-w-[260px]">بيان الأعمال</th><th rowSpan={2}>الوحدة</th><th colSpan={3} className="text-center">الأعمال</th><th rowSpan={2}>السعر</th><th rowSpan={2}>قيمة الأعمال</th><th rowSpan={2}>ملاحظات</th><th rowSpan={2}></th></tr>
            <tr><th className="text-center">سابق</th><th className="text-center">حالي</th><th className="text-center">جملة</th></tr>
          </thead>
          <tbody>
            {items.map((it, i) => (
              <tr key={i}>
                <td className="num">{i + 1}</td>
                <td><input value={it.description} onChange={(e) => update(i, { description: e.target.value })} className="input py-1!" placeholder="البند" /></td>
                <td><input value={it.unit} onChange={(e) => update(i, { unit: e.target.value })} className="input py-1! w-20 text-center" placeholder="م2" /></td>
                <td><input value={it.prevQty || ""} onChange={(e) => update(i, { prevQty: num(e.target.value) })} className="input py-1! w-24 num" disabled={!!it.accountItemId} title={it.accountItemId ? "من المستخلصات السابقة" : ""} /></td>
                <td><input value={it.currentQty || ""} onChange={(e) => update(i, { currentQty: num(e.target.value) })} className="input py-1! w-24 num bg-emerald-50/50" autoFocus={i === 0} /></td>
                <td className="num text-center">{totals.rows[i].totalQty ? money(totals.rows[i].totalQty) : "—"}</td>
                <td><input value={it.price || ""} onChange={(e) => update(i, { price: num(e.target.value) })} className="input py-1! w-24 num" /></td>
                <td className="num font-medium">{money(totals.rows[i].amount)}</td>
                <td><input value={it.note} onChange={(e) => update(i, { note: e.target.value })} className="input py-1! w-32" /></td>
                <td><button type="button" onClick={() => remove(i)} className="text-red-500 text-xs" title="حذف">✕</button></td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr><td colSpan={10} className="no-print"><button type="button" onClick={() => setItems((l) => [...l, blank()])} className="btn-secondary btn-sm">+ بند جديد</button></td></tr>
            <tr><td colSpan={7} className="text-left font-bold">الإجمالي</td><td className="num font-bold">{money(totals.total)}</td><td colSpan={2}></td></tr>
            <tr><td colSpan={7} className="text-left">ما سبق صرفه <span className="text-xs text-stone-400">(من الصندوق: {money(meta.paidFromCashbox)})</span></td><td><input value={previousPaid || ""} onChange={(e) => setPreviousPaid(num(e.target.value))} className="input py-1! w-32 num" /></td><td colSpan={2}></td></tr>
            <tr><td colSpan={7} className="text-left">حسميات / محتجز</td><td><input value={deductions || ""} onChange={(e) => setDeductions(num(e.target.value))} className="input py-1! w-32 num" /></td><td colSpan={2}></td></tr>
            <tr className="bg-emerald-50"><td colSpan={7} className="text-left font-bold text-emerald-900">المستحق صرفه</td><td className="num font-bold text-emerald-900 text-lg">{money(totals.due)}</td><td colSpan={2}></td></tr>
          </tfoot>
        </table>
      </div>

      <div className="card p-4 flex flex-wrap items-end gap-3">
        <div className="flex-1 min-w-[240px]"><label className="label">ملاحظات</label><input value={notes} onChange={(e) => setNotes(e.target.value)} className="input" /></div>
        {error && <div className="text-sm text-red-600">{error}</div>}
        <button onClick={submit} disabled={pending} className="btn-primary">{pending ? "جارٍ الحفظ…" : "حفظ المستخلص"}</button>
      </div>
      <p className="text-xs text-stone-400">يُحفظ كمسودة أولاً. بعد المراجعة اضغط «اعتماد» في صفحة المستخلص فتُحدَّث الكميات التراكمية للحساب وتصبح جاهزة للطباعة.</p>
    </div>
  );
}

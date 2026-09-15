import { lookups } from "@/lib/queries/accounts";
import { db, schema } from "@/db";
import { eq } from "drizzle-orm";
import { addPaymentAction } from "@/app/actions/accounts";
import { today, SOURCE_LABEL } from "@/lib/format";
import { AccountPicker } from "./account-picker";

export default async function NewPaymentPage() {
  const opts = await lookups();
  const accounts = await db.select({ id: schema.accounts.id, title: schema.accounts.title, projectId: schema.accounts.projectId, partyId: schema.accounts.partyId, status: schema.accounts.status, party: schema.parties.name })
    .from(schema.accounts).innerJoin(schema.parties, eq(schema.accounts.partyId, schema.parties.id)).orderBy(schema.parties.name, schema.accounts.title);
  return (
    <div className="max-w-2xl mx-auto space-y-4">
      <h1 className="text-2xl font-bold">تسجيل دفعة صندوق</h1>
      <form action={addPaymentAction} className="card p-5 space-y-4">
        <input type="hidden" name="redirect" value="1" />
        <AccountPicker projects={opts.projects.filter((p) => p.active)} accounts={accounts} />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="col-span-2"><label className="label">البيان</label><input name="label" className="input" placeholder="دفعة من الحساب" /></div>
          <div><label className="label">التاريخ</label><input type="date" name="date" defaultValue={today()} className="input" required /></div>
          <div><label className="label">المبلغ</label><input name="amount" className="input num" required inputMode="decimal" /></div>
          <div><label className="label">طريقة الدفع</label><select name="method" className="input"><option value="نقداً">نقداً</option><option value="تحويل">تحويل</option><option value="شيك">شيك</option><option value="فاتورة">فاتورة</option></select></div>
          <div><label className="label">المصدر</label><select name="source" className="input">{Object.entries(SOURCE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
          <div><label className="label">رقم السند</label><input name="voucher" className="input num" /></div>
          <div><label className="label">ملاحظة</label><input name="note" className="input" /></div>
        </div>
        <div className="flex justify-end"><button className="btn-primary">حفظ الدفعة</button></div>
      </form>
    </div>
  );
}

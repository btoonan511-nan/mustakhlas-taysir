import { lookups } from "@/lib/queries/accounts";
import { createAccountAction } from "@/app/actions/accounts";
import { CATEGORY_LABEL } from "@/lib/format";
import { PartyPicker } from "./party-picker";

export default async function NewAccountPage({ searchParams }: { searchParams: Promise<{ project?: string; next?: string }> }) {
  const sp = await searchParams;
  const opts = await lookups();
  return (
    <div className="max-w-2xl mx-auto space-y-4">
      <h1 className="text-2xl font-bold">حساب جديد</h1>
      <p className="text-sm text-stone-500">الحساب = جهة (مقاول/مورد) تعمل نوع عمل معيّن داخل مشروع. الدفعات والبنود والمستخلصات كلها تتبع الحساب.</p>
      <form action={createAccountAction} className="card p-5 space-y-4">
        <input type="hidden" name="next" value={sp.next ?? ""} />
        <div>
          <label className="label">المشروع</label>
          <select name="projectId" defaultValue={sp.project ?? ""} className="input" required>
            <option value="">— اختر —</option>
            {opts.projects.filter((p) => p.active).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
        <PartyPicker parties={opts.parties.map((p) => ({ id: p.id, name: p.name, category: p.category, phone: p.phone }))} categories={CATEGORY_LABEL} />
        <div>
          <label className="label">نوع العمل</label>
          <select name="workTypeId" className="input"><option value="">— تحديد تلقائي من اسم الحساب —</option>{opts.workTypes.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}</select>
        </div>
        <div>
          <label className="label">اسم الحساب (اختياري)</label>
          <input name="title" className="input" placeholder="مثال: أعمال جبس المجلس — يُولّد تلقائياً إن تُرك فارغاً" />
        </div>
        <div>
          <label className="label">ملاحظات</label>
          <input name="notes" className="input" />
        </div>
        <div className="flex justify-end gap-2">
          <button className="btn-primary">إنشاء الحساب</button>
        </div>
      </form>
    </div>
  );
}

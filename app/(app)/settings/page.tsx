import { sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireAdmin } from "@/lib/auth";
import { CATEGORY_LABEL } from "@/lib/format";
import { addProjectAction, updateProjectAction, deleteProjectAction, updatePartyAction, mergePartyAction, updateWorkTypeAction, mergeWorkTypeAction, addWorkTypeAction, changePasswordAction } from "@/app/actions/settings";
import { ConfirmButton } from "@/app/(app)/confirm-button";
import { Details } from "@/app/(app)/details";

export default async function SettingsPage() {
  await requireAdmin();
  const [projects, parties, workTypes, users] = await Promise.all([
    db.select({ id: schema.projects.id, name: schema.projects.name, aliases: schema.projects.aliases, active: schema.projects.active, accounts: sql<number>`(select count(*) from accounts a where a.project_id = "projects"."id")::int` }).from(schema.projects).orderBy(schema.projects.sort, schema.projects.name),
    db.select({ id: schema.parties.id, name: schema.parties.name, phone: schema.parties.phone, category: schema.parties.category, notes: schema.parties.notes, accounts: sql<number>`(select count(*) from accounts a where a.party_id = "parties"."id")::int` }).from(schema.parties).orderBy(schema.parties.name),
    db.select({ id: schema.workTypes.id, name: schema.workTypes.name, accounts: sql<number>`(select count(*) from accounts a where a.work_type_id = "work_types"."id")::int` }).from(schema.workTypes).orderBy(schema.workTypes.name),
    db.select({ username: schema.users.username, displayName: schema.users.displayName, role: schema.users.role }).from(schema.users),
  ]);

  return (
    <div className="space-y-4 max-w-5xl mx-auto">
      <h1 className="text-2xl font-bold">الإعدادات</h1>

      <Details title={`المشاريع (${projects.length})`} open>
        <div className="space-y-2">
          {projects.map((p) => (
            <div key={p.id} className="flex gap-2 items-center">
              <form action={updateProjectAction} className="flex-1 grid grid-cols-[1fr_2fr_auto_auto_auto] gap-2 items-center">
                <input type="hidden" name="projectId" value={p.id} />
                <input name="name" defaultValue={p.name} className="input py-1!" />
                <input name="aliases" defaultValue={p.aliases.join("، ")} className="input py-1!" placeholder="أسماء بديلة مفصولة بفاصلة" />
                <label className="text-xs flex items-center gap-1"><input type="checkbox" name="active" defaultChecked={p.active} /> نشط</label>
                <span className="text-xs text-stone-400 num w-16">{p.accounts} حساب</span>
                <button className="btn-secondary btn-sm">حفظ</button>
              </form>
              {p.accounts === 0 && <form action={deleteProjectAction}><input type="hidden" name="projectId" value={p.id} /><ConfirmButton className="btn-danger btn-sm" message="حذف المشروع؟">حذف</ConfirmButton></form>}
            </div>
          ))}
          <form action={addProjectAction} className="flex gap-2"><input name="name" className="input" placeholder="مشروع جديد" required /><button className="btn-primary">إضافة</button></form>
        </div>
      </Details>

      <Details title={`الجهات — مقاولون وموردون (${parties.length})`}>
        <form action={mergePartyAction} className="mb-3 p-3 rounded-lg bg-amber-50 border border-amber-200 grid grid-cols-1 md:grid-cols-[1fr_auto_1fr_auto] gap-2 items-end">
          <div><label className="label">دمج الجهة المكررة</label><select name="fromId" className="input" required defaultValue=""><option value="">—</option>{parties.map((x) => <option key={x.id} value={x.id}>{x.name} ({x.accounts})</option>)}</select></div>
          <div className="text-center pb-2">←</div>
          <div><label className="label">في الجهة الصحيحة</label><select name="intoId" className="input" required defaultValue=""><option value="">—</option>{parties.map((x) => <option key={x.id} value={x.id}>{x.name} ({x.accounts})</option>)}</select></div>
          <ConfirmButton className="btn-danger" message="دمج الجهتين؟ تنتقل كل حسابات الأولى إلى الثانية وتُحذف الأولى.">دمج</ConfirmButton>
        </form>
        <div className="overflow-x-auto">
          <table className="table">
            <thead><tr><th>الاسم</th><th>الجوال</th><th>التصنيف</th><th>حسابات</th><th></th></tr></thead>
            <tbody>
              {parties.map((p) => (
                <tr key={p.id}>
                  <td colSpan={5} className="p-0">
                    <form action={updatePartyAction} className="grid grid-cols-[2fr_1fr_1fr_60px_auto] gap-1 px-2 py-1 items-center">
                      <input type="hidden" name="partyId" value={p.id} />
                      <input name="name" defaultValue={p.name} className="input py-1!" />
                      <input name="phone" defaultValue={p.phone} className="input py-1! num" />
                      <select name="category" defaultValue={p.category} className="input py-1!">{Object.entries(CATEGORY_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
                      <span className="text-xs text-stone-400 num text-center">{p.accounts}</span>
                      <button className="btn-secondary btn-sm">حفظ</button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Details>

      <Details title={`أنواع العمل (${workTypes.length})`}>
        <form action={mergeWorkTypeAction} className="mb-3 p-3 rounded-lg bg-amber-50 border border-amber-200 grid grid-cols-1 md:grid-cols-[1fr_auto_1fr_auto] gap-2 items-end">
          <div><label className="label">دمج النوع</label><select name="fromId" className="input" required defaultValue=""><option value="">—</option>{workTypes.map((x) => <option key={x.id} value={x.id}>{x.name} ({x.accounts})</option>)}</select></div>
          <div className="text-center pb-2">←</div>
          <div><label className="label">في النوع</label><select name="intoId" className="input" required defaultValue=""><option value="">—</option>{workTypes.map((x) => <option key={x.id} value={x.id}>{x.name} ({x.accounts})</option>)}</select></div>
          <ConfirmButton className="btn-danger" message="دمج النوعين؟">دمج</ConfirmButton>
        </form>
        <div className="grid md:grid-cols-2 gap-2">
          {workTypes.map((w) => (
            <form key={w.id} action={updateWorkTypeAction} className="flex gap-1"><input type="hidden" name="workTypeId" value={w.id} /><input name="name" defaultValue={w.name} className="input py-1!" /><span className="text-xs text-stone-400 num self-center w-8">{w.accounts}</span><button className="btn-secondary btn-sm">حفظ</button></form>
          ))}
        </div>
        <form action={addWorkTypeAction} className="flex gap-2 mt-3"><input name="name" className="input" placeholder="نوع عمل جديد" required /><button className="btn-primary">إضافة</button></form>
      </Details>

      <Details title="المستخدمون وكلمات المرور">
        <div className="space-y-2">
          {users.map((u) => (
            <form key={u.username} action={changePasswordAction} className="flex gap-2 items-center">
              <input type="hidden" name="username" value={u.username} />
              <span className="w-40 text-sm">{u.displayName} <span className="text-stone-400 text-xs">({u.username} · {u.role === "admin" ? "مدير" : "مستخدم"})</span></span>
              <input name="password" type="password" className="input w-56" placeholder="كلمة مرور جديدة" minLength={6} required autoComplete="new-password" />
              <button className="btn-secondary btn-sm">تغيير</button>
            </form>
          ))}
        </div>
      </Details>

      <Details title="تصدير البيانات">
        <div className="flex gap-2 flex-wrap">
          <a href="/api/export?type=payments" className="btn-secondary">تصدير الدفعات (Excel)</a>
          <a href="/api/export?type=accounts" className="btn-secondary">تصدير الحسابات (Excel)</a>
          <a href="/api/export?type=items" className="btn-secondary">تصدير بنود الأعمال (Excel)</a>
        </div>
      </Details>
    </div>
  );
}

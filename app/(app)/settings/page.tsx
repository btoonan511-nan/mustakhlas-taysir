import { sql, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireAdmin } from "@/lib/auth";
import { CATEGORY_LABEL } from "@/lib/format";
import { addProjectAction, updateProjectAction, deleteProjectAction, updatePartyAction, mergePartyAction, updateWorkTypeAction, mergeWorkTypeAction, addWorkTypeAction, changePasswordAction } from "@/app/actions/settings";
import { ConfirmButton } from "@/app/(app)/confirm-button";
import { Details } from "@/app/(app)/details";

export default async function SettingsPage() {
  await requireAdmin();
  const projects = await db.select({ id: schema.projects.id, name: schema.projects.name, aliases: schema.projects.aliases, active: schema.projects.active, accounts: sql<number>`(select count(*) from accounts a where a.project_id = "projects"."id")::int` }).from(schema.projects).orderBy(schema.projects.sort, schema.projects.name);
  const parties = await db.select({ id: schema.parties.id, name: schema.parties.name, phone: schema.parties.phone, category: schema.parties.category, notes: schema.parties.notes, accounts: sql<number>`(select count(*) from accounts a where a.party_id = "parties"."id")::int` }).from(schema.parties).orderBy(schema.parties.name);
  const workTypes = await db.select({ id: schema.workTypes.id, name: schema.workTypes.name, accounts: sql<number>`(select count(*) from accounts a where a.work_type_id = "work_types"."id")::int` }).from(schema.workTypes).orderBy(schema.workTypes.name);
  const users = await db.select({ username: schema.users.username, displayName: schema.users.displayName, role: schema.users.role }).from(schema.users).where(eq(schema.users.username, schema.users.username));

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
        <p className="text-xs text-stone-500 mb-2">لدمج جهتين مكررتين (مثل «روبل» و«روبل حداد»): اختر في عمود «دمج في» الجهة الصحيحة ثم اضغط دمج — تنتقل كل الحسابات إليها.</p>
        <div className="overflow-x-auto">
          <table className="table">
            <thead><tr><th>الاسم</th><th>الجوال</th><th>التصنيف</th><th>حسابات</th><th></th><th>دمج في</th></tr></thead>
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
                  <td className="p-1">
                    <form action={mergePartyAction} className="flex gap-1">
                      <input type="hidden" name="fromId" value={p.id} />
                      <select name="intoId" className="input py-1! w-40" defaultValue=""><option value="">—</option>{parties.filter((x) => x.id !== p.id).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select>
                      <ConfirmButton className="btn-danger btn-sm" message={`دمج "${p.name}" في الجهة المختارة؟`}>دمج</ConfirmButton>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Details>

      <Details title={`أنواع العمل (${workTypes.length})`}>
        <div className="grid md:grid-cols-2 gap-2">
          {workTypes.map((w) => (
            <div key={w.id} className="flex gap-1 items-center">
              <form action={updateWorkTypeAction} className="flex gap-1 flex-1"><input type="hidden" name="workTypeId" value={w.id} /><input name="name" defaultValue={w.name} className="input py-1!" /><span className="text-xs text-stone-400 num self-center w-8">{w.accounts}</span><button className="btn-secondary btn-sm">حفظ</button></form>
              <form action={mergeWorkTypeAction} className="flex gap-1"><input type="hidden" name="fromId" value={w.id} /><select name="intoId" className="input py-1! w-32" defaultValue=""><option value="">دمج في…</option>{workTypes.filter((x) => x.id !== w.id).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select><ConfirmButton className="btn-danger btn-sm" message={`دمج "${w.name}"؟`}>دمج</ConfirmButton></form>
            </div>
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

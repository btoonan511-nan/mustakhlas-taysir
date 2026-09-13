"use client";

import { useRouter } from "next/navigation";
import { CATEGORY_LABEL } from "@/lib/format";

type Options = { projects: { id: number; name: string }[]; parties: { id: number; name: string }[]; workTypes: { id: number; name: string }[] };
type Current = { q: string; project: string; party: string; work: string; category: string; status: string; review: string };

export function AccountFilters({ options, current }: { options: Options; current: Current }) {
  const router = useRouter();
  const submit = (form: HTMLFormElement) => {
    const fd = new FormData(form);
    const qs = new URLSearchParams();
    for (const [k, v] of fd.entries()) if (String(v).trim()) qs.set(k, String(v));
    router.push(`/accounts?${qs.toString()}`);
  };
  return (
    <form className="no-print card p-3 grid grid-cols-2 md:grid-cols-8 gap-2 items-end" onSubmit={(e) => { e.preventDefault(); submit(e.currentTarget); }} onChange={(e) => { const t = e.target as unknown as HTMLInputElement; if (t.tagName === "SELECT" || t.type === "checkbox") submit(e.currentTarget); }}>
      <div className="col-span-2"><label className="label">بحث</label><input name="q" defaultValue={current.q} className="input" placeholder="اسم الحساب أو الجهة" /></div>
      <div><label className="label">المشروع</label>
        <select name="project" defaultValue={current.project} className="input"><option value="">الكل</option>{options.projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></div>
      <div><label className="label">الجهة</label>
        <select name="party" defaultValue={current.party} className="input"><option value="">الكل</option>{options.parties.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></div>
      <div><label className="label">نوع العمل</label>
        <select name="work" defaultValue={current.work} className="input"><option value="">الكل</option>{options.workTypes.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></div>
      <div><label className="label">التصنيف</label>
        <select name="category" defaultValue={current.category} className="input"><option value="">الكل</option>{Object.entries(CATEGORY_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
      <div><label className="label">الحالة</label>
        <select name="status" defaultValue={current.status} className="input"><option value="">الكل</option><option value="open">جاري</option><option value="closed">خالص</option></select></div>
      <div className="flex items-center gap-2 pb-2">
        <label className="flex items-center gap-1 text-sm"><input type="checkbox" name="review" value="1" defaultChecked={current.review === "1"} /> تحتاج مراجعة</label>
      </div>
    </form>
  );
}

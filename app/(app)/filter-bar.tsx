"use client";

import { useRouter } from "next/navigation";
import { CATEGORY_LABEL } from "@/lib/format";

type Options = { projects: { id: number; name: string }[]; parties: { id: number; name: string; category: string }[]; workTypes: { id: number; name: string }[] };
type Current = { from: string; to: string; project: string; party: string; work: string; category: string };

export function FilterBar({ options, current, basePath = "/" }: { options: Options; current: Current; basePath?: string }) {
  const router = useRouter();
  const submit = (form: HTMLFormElement) => {
    const fd = new FormData(form);
    const qs = new URLSearchParams();
    for (const [k, v] of fd.entries()) if (String(v).trim()) qs.set(k, String(v));
    router.push(`${basePath}?${qs.toString()}`);
  };
  return (
    <form className="no-print card p-3 grid grid-cols-2 md:grid-cols-7 gap-2 items-end" onSubmit={(e) => { e.preventDefault(); submit(e.currentTarget); }} onChange={(e) => submit(e.currentTarget)}>
      <div><label className="label">من تاريخ</label><input type="date" name="from" defaultValue={current.from} className="input" /></div>
      <div><label className="label">إلى تاريخ</label><input type="date" name="to" defaultValue={current.to} className="input" /></div>
      <div><label className="label">المشروع</label>
        <select name="project" defaultValue={current.project} className="input"><option value="">الكل</option>{options.projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></div>
      <div><label className="label">الجهة</label>
        <select name="party" defaultValue={current.party} className="input"><option value="">الكل</option>{options.parties.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></div>
      <div><label className="label">نوع العمل</label>
        <select name="work" defaultValue={current.work} className="input"><option value="">الكل</option>{options.workTypes.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></div>
      <div><label className="label">التصنيف</label>
        <select name="category" defaultValue={current.category} className="input"><option value="">الكل</option>{Object.entries(CATEGORY_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
      <div className="flex gap-2"><button type="button" className="btn-secondary w-full" onClick={() => router.push(basePath)}>مسح</button></div>
    </form>
  );
}

import Link from "next/link";
import { db, schema } from "@/db";
import { eq } from "drizzle-orm";
import { getAccount, lookups, partiesInProject, accountsFor } from "@/lib/queries/accounts";
import { money, today, CATEGORY_LABEL } from "@/lib/format";
import { CertificateEditor } from "../editor";
import { PartyPicker } from "@/app/(app)/accounts/new/party-picker";
import { createAccountAction } from "@/app/actions/accounts";

type Search = { account?: string; project?: string; party?: string };

export default async function NewCertificatePage({ searchParams }: { searchParams: Promise<Search> }) {
  const sp = await searchParams;
  const accountId = Number(sp.account);

  // Step 3: editor for a chosen account
  if (accountId) {
    const acc = await getAccount(accountId);
    if (!acc) return <p>الحساب غير موجود</p>;
    const paid = acc.payments.reduce((s, p) => s + p.amount, 0);
    const items = acc.items.filter((i) => i.active).map((i) => ({ accountItemId: i.id, description: i.description, unit: i.unit, prevQty: i.cumQty, currentQty: 0, price: i.price, note: "" }));
    return (
      <div className="space-y-4">
        <div className="text-sm text-stone-500"><Link href="/certificates/new" className="hover:underline">مستخلص جديد</Link> / {acc.project.name} / {acc.party.name}</div>
        <h1 className="text-2xl font-bold">مستخلص جديد — {acc.title}</h1>
        <CertificateEditor
          cert={{ accountId: acc.id, date: today(), notes: "", previousPaid: paid, deductions: 0, items }}
          meta={{ project: acc.project.name, party: acc.party.name, phone: acc.party.phone, workType: acc.workType?.name ?? "", paidFromCashbox: paid, certCount: acc.certificates.length }}
        />
      </div>
    );
  }

  const opts = await lookups();
  const projectId = Number(sp.project);
  const partyId = Number(sp.party);

  // Step 1: choose project
  if (!projectId) {
    return (
      <div className="max-w-3xl mx-auto space-y-4">
        <h1 className="text-2xl font-bold">مستخلص جديد</h1>
        <p className="text-sm text-stone-500">١. اختر المشروع</p>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {opts.projects.filter((p) => p.active && !p.name.includes("يحتاج تحديد")).map((p) => (
            <Link key={p.id} href={`/certificates/new?project=${p.id}`} className="card p-5 hover:border-emerald-500 hover:shadow transition text-center font-semibold">{p.name}</Link>
          ))}
        </div>
      </div>
    );
  }
  const project = opts.projects.find((p) => p.id === projectId)!;

  // Step 2: choose party (in project, or new)
  if (!partyId) {
    const parties = await partiesInProject(projectId);
    return (
      <div className="max-w-3xl mx-auto space-y-4">
        <div className="text-sm text-stone-500"><Link href="/certificates/new" className="hover:underline">مستخلص جديد</Link> / {project.name}</div>
        <h1 className="text-2xl font-bold">{project.name}</h1>
        <p className="text-sm text-stone-500">٢. اختر المقاول — أو أضف مقاولاً جديداً في هذا المشروع</p>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
          {parties.map((p) => (
            <Link key={p.id} href={`/certificates/new?project=${projectId}&party=${p.id}`} className="card px-4 py-3 hover:border-emerald-500 transition">
              <div className="font-medium">{p.name}</div><div className="text-xs text-stone-400">{CATEGORY_LABEL[p.category]}</div>
            </Link>
          ))}
        </div>
        <details className="card">
          <summary className="cursor-pointer px-4 py-3 font-semibold text-emerald-800">+ مقاول جديد / حساب جديد في {project.name}</summary>
          <form action={createAccountAction} className="px-4 pb-4 space-y-3">
            <input type="hidden" name="projectId" value={projectId} /><input type="hidden" name="next" value="certificate" />
            <PartyPicker parties={opts.parties.map((p) => ({ id: p.id, name: p.name, category: p.category, phone: p.phone }))} categories={CATEGORY_LABEL} />
            <div className="grid grid-cols-2 gap-2">
              <div><label className="label">نوع العمل</label><select name="workTypeId" className="input"><option value="">— تلقائي —</option>{opts.workTypes.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}</select></div>
              <div><label className="label">اسم الحساب</label><input name="title" className="input" placeholder="مثال: جبس المجلس" /></div>
            </div>
            <div className="flex justify-end"><button className="btn-primary">إنشاء وفتح المستخلص</button></div>
          </form>
        </details>
      </div>
    );
  }

  // Step 2b: choose account for the party (their work packages in this project)
  const [party] = await db.select().from(schema.parties).where(eq(schema.parties.id, partyId));
  const accs = await accountsFor(projectId, partyId);
  return (
    <div className="max-w-3xl mx-auto space-y-4">
      <div className="text-sm text-stone-500"><Link href="/certificates/new" className="hover:underline">مستخلص جديد</Link> / <Link href={`/certificates/new?project=${projectId}`} className="hover:underline">{project.name}</Link> / {party.name}</div>
      <h1 className="text-2xl font-bold">{party.name} — {project.name}</h1>
      <p className="text-sm text-stone-500">٣. اختر الحساب (نوع العمل) — تظهر بنوده السابقة كاملة في المستخلص</p>
      <div className="space-y-2">
        {accs.map((a) => (
          <Link key={a.id} href={`/certificates/new?account=${a.id}`} className="card px-4 py-3 flex items-center justify-between hover:border-emerald-500 transition">
            <div><div className="font-medium">{a.title}</div><div className="text-xs text-stone-400">{a.workType} · {a.items} بند · {a.status === "closed" ? "خالص" : "جاري"}</div></div>
            <div className="num text-sm text-stone-600">صُرف {money(a.paid)}</div>
          </Link>
        ))}
      </div>
      <details className="card">
        <summary className="cursor-pointer px-4 py-3 font-semibold text-emerald-800">+ حساب جديد لـ {party.name} (نوع عمل آخر)</summary>
        <form action={createAccountAction} className="px-4 pb-4 space-y-3">
          <input type="hidden" name="projectId" value={projectId} /><input type="hidden" name="partyId" value={partyId} /><input type="hidden" name="next" value="certificate" />
          <div className="grid grid-cols-2 gap-2">
            <div><label className="label">نوع العمل</label><select name="workTypeId" className="input"><option value="">— تلقائي —</option>{opts.workTypes.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}</select></div>
            <div><label className="label">اسم الحساب</label><input name="title" className="input" placeholder="مثال: دهان الواجهات" /></div>
          </div>
          <div className="flex justify-end"><button className="btn-primary">إنشاء وفتح المستخلص</button></div>
        </form>
      </details>
    </div>
  );
}

"use client";

import { useMemo, useState } from "react";

type Account = { id: number; title: string; projectId: number; partyId: number; status: string; party: string };

export function AccountPicker({ projects, accounts, name = "accountId" }: { projects: { id: number; name: string }[]; accounts: Account[]; name?: string }) {
  const [projectId, setProjectId] = useState<number>(0);
  const [partyId, setPartyId] = useState<number>(0);
  const inProject = useMemo(() => accounts.filter((a) => !projectId || a.projectId === projectId), [accounts, projectId]);
  const parties = useMemo(() => {
    const m = new Map<number, string>();
    for (const a of inProject) m.set(a.partyId, a.party);
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1], "ar"));
  }, [inProject]);
  const list = inProject.filter((a) => !partyId || a.partyId === partyId);
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
      <div>
        <label className="label">المشروع</label>
        <select className="input" value={projectId} onChange={(e) => { setProjectId(Number(e.target.value)); setPartyId(0); }}>
          <option value={0}>الكل</option>{projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </div>
      <div>
        <label className="label">الجهة</label>
        <select className="input" value={partyId} onChange={(e) => setPartyId(Number(e.target.value))}>
          <option value={0}>الكل</option>{parties.map(([id, n]) => <option key={id} value={id}>{n}</option>)}
        </select>
      </div>
      <div>
        <label className="label">الحساب</label>
        <select name={name} className="input" required defaultValue="">
          <option value="">— اختر —</option>
          {list.map((a) => <option key={a.id} value={a.id}>{a.party} — {a.title}{a.status === "closed" ? " (خالص)" : ""}</option>)}
        </select>
      </div>
    </div>
  );
}

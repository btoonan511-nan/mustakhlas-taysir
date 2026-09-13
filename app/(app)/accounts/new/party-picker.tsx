"use client";

import { useState } from "react";

type Party = { id: number; name: string; category: string; phone: string };

export function PartyPicker({ parties, categories, defaultPartyId }: { parties: Party[]; categories: Record<string, string>; defaultPartyId?: number }) {
  const [mode, setMode] = useState<"existing" | "new">(defaultPartyId || parties.length ? "existing" : "new");
  const [q, setQ] = useState("");
  const filtered = q ? parties.filter((p) => p.name.includes(q)) : parties;
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="label mb-0">الجهة (المقاول / المورد)</label>
        <div className="flex gap-1 text-xs">
          <button type="button" onClick={() => setMode("existing")} className={`px-2 py-1 rounded ${mode === "existing" ? "bg-emerald-100 text-emerald-800" : "text-stone-500"}`}>موجودة</button>
          <button type="button" onClick={() => setMode("new")} className={`px-2 py-1 rounded ${mode === "new" ? "bg-emerald-100 text-emerald-800" : "text-stone-500"}`}>+ جديدة</button>
        </div>
      </div>
      {mode === "existing" ? (
        <div className="grid grid-cols-[1fr_2fr] gap-2">
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="بحث…" className="input" />
          <select name="partyId" defaultValue={defaultPartyId ?? ""} className="input" required>
            <option value="">— اختر —</option>
            {filtered.map((p) => <option key={p.id} value={p.id}>{p.name} ({categories[p.category]}{p.phone ? ` · ${p.phone}` : ""})</option>)}
          </select>
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
          <input name="partyName" placeholder="اسم الجهة" className="input" required />
          <input name="partyPhone" placeholder="الجوال" className="input num" />
          <select name="partyCategory" className="input" defaultValue="contractor">{Object.entries(categories).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
        </div>
      )}
    </div>
  );
}

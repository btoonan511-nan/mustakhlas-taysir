const nf = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 });
const nf0 = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });

export function money(v: number | string | null | undefined, opts: { compact?: boolean } = {}): string {
  const n = Number(v ?? 0);
  if (!Number.isFinite(n)) return "0";
  if (opts.compact && Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(2)} م`;
  if (opts.compact && Math.abs(n) >= 10_000) return `${nf0.format(n / 1000)} ألف`;
  return nf.format(n);
}

export function qty(v: number | string | null | undefined): string {
  const n = Number(v ?? 0);
  if (!Number.isFinite(n) || n === 0) return "—";
  return nf.format(n);
}

export function fmtDate(d: string | Date | null | undefined): string {
  if (!d) return "—";
  const s = typeof d === "string" ? d : d.toISOString();
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : s;
}

export function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export const CATEGORY_LABEL: Record<string, string> = {
  contractor: "مقاول",
  supplier: "مورد",
  equipment: "معدات",
  rental: "إيجار",
  other: "أخرى",
};

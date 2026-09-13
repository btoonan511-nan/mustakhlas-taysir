export function Details({ title, children, className = "", open = false }: { title: string; children: React.ReactNode; className?: string; open?: boolean }) {
  return (
    <details className={`card ${className}`} open={open}>
      <summary className="cursor-pointer select-none px-4 py-3 font-semibold text-stone-700">{title}</summary>
      <div className="px-4 pb-4">{children}</div>
    </details>
  );
}

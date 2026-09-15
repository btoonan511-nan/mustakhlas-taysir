export default function Loading() {
  return (
    <div className="animate-pulse space-y-4" aria-busy="true">
      <div className="h-7 w-48 rounded bg-stone-200" />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-20 rounded-xl bg-stone-200" />)}
      </div>
      <div className="h-64 rounded-xl bg-stone-200" />
    </div>
  );
}

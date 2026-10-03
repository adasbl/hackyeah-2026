export default function Loading() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-8" aria-busy="true" aria-label="Wczytywanie wyników">
      <div className="h-[152px] animate-pulse rounded-3xl bg-white/70 ring-1 ring-slate-200" />
      <div className="mt-10 h-8 w-72 animate-pulse rounded-lg bg-slate-200/70" />
      <div className="mt-5 grid gap-4 md:grid-cols-2">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="h-44 animate-pulse rounded-2xl bg-white/80 ring-1 ring-slate-200" />
        ))}
      </div>
    </div>
  );
}

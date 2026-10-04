/** Szkielet strony obiektu – pokazuje się od razu po kliknięciu, zanim serwer odda dane. */
export default function Loading() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-8" aria-busy="true" aria-label="Wczytywanie obiektu">
      <div className="mb-5 h-9 w-44 animate-pulse rounded-full bg-white/80 ring-1 ring-slate-200" />
      <div className="flex items-start gap-4">
        <div className="size-16 shrink-0 animate-pulse rounded-2xl bg-slate-200/80" />
        <div className="flex-1 space-y-2">
          <div className="h-3 w-24 animate-pulse rounded bg-slate-200/70" />
          <div className="h-8 w-2/3 max-w-md animate-pulse rounded-lg bg-slate-200/70" />
          <div className="h-4 w-1/2 max-w-sm animate-pulse rounded bg-slate-200/60" />
        </div>
      </div>
      <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_300px]">
        <div className="h-96 animate-pulse rounded-3xl bg-white/80 ring-1 ring-slate-200" />
        <div className="space-y-6">
          <div className="h-80 animate-pulse rounded-3xl bg-white/80 ring-1 ring-slate-200" />
          <div className="h-40 animate-pulse rounded-3xl bg-white/80 ring-1 ring-slate-200" />
        </div>
      </div>
    </div>
  );
}

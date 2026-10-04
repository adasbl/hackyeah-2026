'use client';

export default function AdminError({ reset }: { reset: () => void }) {
  return <section className="rounded-2xl border border-slate-200 bg-white p-6">
    <h1 className="text-xl font-bold">Panel jest chwilowo niedostępny</h1>
    <p role="alert" className="mt-2 text-slate-600">Nie udało się pobrać danych. Spróbuj ponownie za chwilę.</p>
    <button onClick={reset} className="mt-4 min-h-11 rounded-xl bg-brand-600 px-4 py-2 font-semibold text-white hover:bg-brand-700">Spróbuj ponownie</button>
  </section>;
}

'use client';

export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="mx-auto w-full max-w-xl px-4 py-20 text-center">
      <p className="text-3xl" aria-hidden>⚠️</p>
      <h1 className="mt-2 text-xl font-semibold">Coś poszło nie tak</h1>
      <p className="mt-1 text-slate-600">Nie udało się wczytać danych. Spróbuj ponownie za chwilę.</p>
      <button onClick={reset} className="mt-6 rounded-lg bg-ink px-4 py-2 text-sm font-medium text-white">
        Spróbuj ponownie
      </button>
    </div>
  );
}

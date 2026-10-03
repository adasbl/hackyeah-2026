import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="mx-auto w-full max-w-xl px-4 py-20 text-center">
      <p className="text-3xl" aria-hidden>🧭</p>
      <h1 className="mt-2 text-xl font-semibold">Nie znaleźliśmy tej strony</h1>
      <p className="mt-1 text-slate-600">Obiekt mógł zostać usunięty albo adres jest błędny.</p>
      <Link href="/" className="mt-6 inline-block rounded-lg bg-ink px-4 py-2 text-sm font-medium text-white">
        Wróć do wyszukiwarki
      </Link>
    </div>
  );
}

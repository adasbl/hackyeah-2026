import Link from 'next/link';

export function SiteFooter() {
  return (
    <footer className="mt-auto border-t border-slate-200 bg-white">
      <div className="mx-auto grid max-w-6xl gap-5 px-4 py-6 text-sm leading-relaxed text-slate-500 sm:px-6 md:grid-cols-2 md:gap-12">
        <div>
          <p>Serwis nie jest powiązany z operatorami kart MultiSport, BeActive, Medicover Sport ani PZU Sport. Nazwy kart służą wyłącznie do opisania, czy obiekt deklaruje ich akceptację. Przed wizytą potwierdź warunki w obiekcie.</p>
        </div>
        <div>
          <p>Dane obiektów: © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 hover:text-brand-700">OpenStreetMap contributors</a> (ODbL). Informacje mogą wymagać aktualizacji.</p>
          <Link href="/admin" prefetch={false} className="mt-2 inline-flex min-h-11 items-center text-xs text-slate-500 underline-offset-4 hover:text-brand-700 hover:underline focus-visible:rounded focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand-600">Panel administratora</Link>
        </div>
      </div>
    </footer>
  );
}

export function SiteFooter() {
  return (
    <footer className="mt-auto border-t border-slate-200 bg-white">
      <div className="mx-auto grid max-w-6xl gap-5 px-4 py-6 text-sm leading-relaxed text-slate-500 sm:px-6 md:grid-cols-2 md:gap-12">
        <div>
          <p>Serwis nie jest powiązany z operatorami kart MultiSport, BeActive, Medicover Sport ani PZU Sport. Nazwy kart służą wyłącznie do opisania, czy obiekt deklaruje ich akceptację. Przed wizytą potwierdź warunki w obiekcie.</p>
        </div>
        <div>
          <p>Dane obiektów: © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 hover:text-brand-700">OpenStreetMap contributors</a> (ODbL). Informacje mogą wymagać aktualizacji.</p>
        </div>
      </div>
    </footer>
  );
}

export function SiteFooter() {
  return (
    <footer className="border-t border-slate-200 bg-white">
      <div className="mx-auto max-w-6xl space-y-2 px-4 py-6 text-xs leading-relaxed text-slate-500">
        <p>
          Serwis nie jest powiązany z operatorami kart MultiSport, BeActive, Medicover Sport ani PZU Sport. Nazwy kart
          służą wyłącznie do opisania, czy obiekt deklaruje ich akceptację. Przed wizytą potwierdź warunki w obiekcie.
        </p>
        <p>
          Dane obiektów: ©{' '}
          <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer" className="underline">
            OpenStreetMap contributors
          </a>{' '}
          (ODbL). Dane mogą wymagać aktualizacji; przed wizytą sprawdź informacje na stronie obiektu.
        </p>
        <p className="font-medium text-amber-700">Obiekty oznaczone [DEMO] zawierają fikcyjne dane przykładowe.</p>
      </div>
    </footer>
  );
}

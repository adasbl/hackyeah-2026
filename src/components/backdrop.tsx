/**
 * Dekoracyjne tło z miękkimi plamami światła.
 * Plamy to radial-gradient zamiast `filter: blur()` i nie są animowane: przeglądarka rysuje je raz.
 * Rozmyte, ruchome plamy pod szklanymi panelami (backdrop-blur w nagłówku, formularzu, kartach)
 * zmuszały ją do przeliczania rozmycia w każdej klatce – to obciążało GPU i przycinało przewijanie.
 */
export function Backdrop() {
  return (
    <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden" aria-hidden>
      <div className="absolute left-[calc(50%-552px)] top-[-270px] size-[740px] bg-[radial-gradient(closest-side,var(--color-brand-500)_30%,transparent)] opacity-20" />
      <div className="absolute left-[calc(50%-87px)] top-[-206px] size-[680px] bg-[radial-gradient(closest-side,var(--color-violet-500)_30%,transparent)] opacity-[0.17]" />
      <div className="absolute left-[calc(50%-240px)] top-[70px] size-[480px] bg-[radial-gradient(closest-side,var(--color-cyan-400)_30%,transparent)] opacity-[0.12]" />
      <div className="absolute inset-0 bg-[radial-gradient(rgba(15,23,42,0.08)_1px,transparent_1px)] [background-size:22px_22px] [mask-image:radial-gradient(ellipse_at_top,black_20%,transparent_70%)]" />
    </div>
  );
}

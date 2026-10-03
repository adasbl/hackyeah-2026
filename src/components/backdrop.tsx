/** Dekoracyjne, rozmyte tło z delikatnie poruszającymi się plamami światła */
export function Backdrop() {
  return (
    <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden" aria-hidden>
      <div className="absolute -top-40 left-1/2 h-[520px] w-[520px] -translate-x-[85%] rounded-full bg-brand-500/25 blur-[110px] animate-drift" />
      <div className="absolute -top-24 left-1/2 h-[460px] w-[460px] translate-x-[5%] rounded-full bg-violet-500/20 blur-[110px] animate-drift [animation-delay:-6s]" />
      <div className="absolute top-40 left-1/2 h-[300px] w-[300px] -translate-x-1/2 rounded-full bg-cyan-400/15 blur-[90px] animate-drift [animation-delay:-12s]" />
      <div className="absolute inset-0 bg-[radial-gradient(rgba(15,23,42,0.08)_1px,transparent_1px)] [background-size:22px_22px] [mask-image:radial-gradient(ellipse_at_top,black_20%,transparent_70%)]" />
    </div>
  );
}

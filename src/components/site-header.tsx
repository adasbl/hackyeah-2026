import Link from 'next/link';

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-50 border-b border-slate-200/60 bg-white/70 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-center px-4">
        <Link
          href="/"
          aria-label="Fit Pass Finder, strona główna"
          className="bg-gradient-to-r from-brand-600 via-violet-600 to-fuchsia-500 bg-clip-text text-xl font-bold tracking-tight text-transparent transition hover:opacity-80"
        >
          Fit Pass Finder
        </Link>
      </div>
    </header>
  );
}

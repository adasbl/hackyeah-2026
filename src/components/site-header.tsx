import Link from 'next/link';
import { Dumbbell } from 'lucide-react';
import { FavoritesLink } from './favorites/favorites-link';

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-50 border-b border-slate-200/60 bg-white/70 backdrop-blur-xl">
      <div className="mx-auto flex min-h-18 max-w-6xl items-center justify-between gap-3 px-4 sm:px-6">
        <Link
          href="/"
          aria-label="Fit Pass Finder, strona główna"
          className="flex min-w-0 items-center gap-2.5 text-lg font-bold tracking-tight transition hover:opacity-80 sm:text-xl"
        >
          <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-brand-500 to-violet-600 text-white"><Dumbbell className="size-5" aria-hidden /></span>
          <span className="bg-gradient-to-r from-brand-600 via-violet-600 to-fuchsia-500 bg-clip-text text-transparent">Fit Pass Finder</span>
        </Link>
        <nav className="shrink-0" aria-label="Moje">
          <FavoritesLink />
        </nav>
      </div>
    </header>
  );
}

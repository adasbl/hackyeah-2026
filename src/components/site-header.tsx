import Link from 'next/link';
import { FavoritesLink } from './favorites/favorites-link';

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-50 border-b border-slate-200/60 bg-white/70 backdrop-blur-xl">
      <div className="relative mx-auto flex h-16 max-w-6xl items-center justify-center px-4">
        <Link
          href="/"
          aria-label="Fit Pass Finder, strona główna"
          className="bg-gradient-to-r from-brand-600 via-violet-600 to-fuchsia-500 bg-clip-text text-xl font-bold tracking-tight text-transparent transition hover:opacity-80"
        >
          Fit Pass Finder
        </Link>
        <nav className="absolute right-4 top-1/2 -translate-y-1/2" aria-label="Moje">
          <FavoritesLink />
        </nav>
      </div>
    </header>
  );
}

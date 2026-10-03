import type { Metadata } from 'next';
import { Backdrop } from '@/components/backdrop';
import { FavoritesList } from '@/components/favorites/favorites-list';

export const metadata: Metadata = { title: 'Ulubione obiekty' };

export default function FavoritesPage() {
  return (
    <div className="relative isolate flex-1">
      <Backdrop />
      <div className="mx-auto max-w-5xl px-4 py-8">
        <h1 className="animate-fade-up text-2xl font-bold tracking-tight sm:text-3xl">Ulubione obiekty</h1>
        <p className="mt-1 text-sm text-slate-500">Zapisane tylko w tej przeglądarce – bez konta i logowania.</p>
        <div className="mt-6">
          <FavoritesList />
        </div>
      </div>
    </div>
  );
}

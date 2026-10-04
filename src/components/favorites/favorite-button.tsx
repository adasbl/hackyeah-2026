'use client';

import { Heart } from 'lucide-react';
import { useFavorites } from '@/lib/favorites';

interface Props {
  slug: string;
  name: string;
  variant?: 'icon' | 'pill';
  className?: string;
}

export function FavoriteButton({ slug, name, variant = 'icon', className = '' }: Props) {
  const { has, toggle } = useFavorites();
  const on = has(slug);
  const label = on ? `Usuń ${name} z ulubionych` : `Dodaj ${name} do ulubionych`;

  if (variant === 'pill') {
    return (
      <button
        type="button"
        onClick={() => toggle(slug)}
        aria-pressed={on}
        aria-label={label}
        className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium shadow-sm transition active:scale-95 ${
          on ? 'border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100' : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:text-ink'
        } ${className}`}
      >
        <Heart className={`size-4 transition ${on ? 'fill-rose-500 text-rose-500 animate-pop' : ''}`} aria-hidden />
        {on ? 'W ulubionych' : 'Dodaj do ulubionych'}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        toggle(slug);
      }}
      aria-pressed={on}
      aria-label={label}
      title={on ? 'Usuń z ulubionych' : 'Dodaj do ulubionych'}
      className={`grid size-9 place-items-center rounded-full transition active:scale-90 ${
        on ? 'bg-rose-50 text-rose-500 hover:bg-rose-100' : 'bg-white/80 text-slate-400 hover:bg-slate-100 hover:text-rose-500'
      } ${className}`}
    >
      <Heart className={`size-[1.125rem] ${on ? 'fill-rose-500 animate-pop' : ''}`} aria-hidden />
    </button>
  );
}

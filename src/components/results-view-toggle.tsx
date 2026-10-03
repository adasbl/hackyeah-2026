'use client';

import { List, Map } from 'lucide-react';
import type { ReactNode } from 'react';
import { useState } from 'react';

type View = 'list' | 'map';

interface Props {
  map: ReactNode;
  list: ReactNode;
}

export function ResultsViewToggle({ map, list }: Props) {
  const [view, setView] = useState<View>('list');

  return (
    <section aria-label="Widok wyników">
      <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white/95 p-2 shadow-sm backdrop-blur sm:flex-row sm:items-center sm:justify-between sm:p-3">
        <p className="px-2 text-sm font-semibold text-ink">Pokaż wyniki jako</p>
        <div className="grid grid-cols-2 gap-1 rounded-xl bg-slate-100 p-1" role="group" aria-label="Wybierz widok wyników">
          <button
            type="button"
            aria-pressed={view === 'list'}
            onClick={() => setView('list')}
            className={`flex min-h-11 items-center justify-center gap-2 rounded-lg px-4 text-sm font-semibold transition ${
              view === 'list'
                ? 'bg-ink text-white shadow-md shadow-slate-900/15'
                : 'text-slate-600 hover:bg-white hover:text-ink'
            }`}
          >
            <List className="size-4" aria-hidden />
            Lista
          </button>
          <button
            type="button"
            aria-pressed={view === 'map'}
            onClick={() => setView('map')}
            className={`flex min-h-11 items-center justify-center gap-2 rounded-lg px-4 text-sm font-semibold transition ${
              view === 'map'
                ? 'bg-brand-600 text-white shadow-md shadow-brand-600/25'
                : 'text-slate-600 hover:bg-white hover:text-ink'
            }`}
          >
            <Map className="size-4" aria-hidden />
            Mapa
          </button>
        </div>
      </div>

      <div className="mt-4">{view === 'map' ? map : list}</div>
    </section>
  );
}

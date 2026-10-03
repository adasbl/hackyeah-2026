'use client';

import { ArrowRight, BarChart3, ChevronDown } from 'lucide-react';
import Link from 'next/link';
import { useId, useState } from 'react';
import type { CardCoverage, CardStatsResponse } from '@repo/types';
import { providerName } from '@/lib/catalog';
import { buildSearchUrl } from '@/lib/search-params';

export interface CardStatsDataset {
  /** slug miasta albo „polska” */
  slug: string;
  /** krótka nazwa na zakładce, np. „Warszawa” */
  label: string;
  /** „w Warszawie”, „w całej Polsce” */
  where: string;
  stats: CardStatsResponse;
}

/** Segmenty paska w stałej kolejności – kolor należy do statusu, nie do pozycji. */
const SEGMENTS = [
  { key: 'accepted', label: 'akceptuje', bar: 'bg-emerald-500', dot: 'bg-emerald-500' },
  { key: 'conditional', label: 'pod warunkami', bar: 'bg-amber-400', dot: 'bg-amber-400' },
  { key: 'notAccepted', label: 'nie akceptuje', bar: 'bg-rose-400', dot: 'bg-rose-400' },
  { key: 'unknown', label: 'brak danych', bar: 'bg-slate-200', dot: 'bg-slate-300' },
] as const;

const pct = (n: number, total: number) => (total ? Math.round((n / total) * 100) : 0);
const covered = (p: CardCoverage) => p.accepted + p.conditional;

/**
 * „Która karta daje najwięcej?” – zwijana sekcja na stronie głównej.
 * Dla każdej karty pasek: ile obiektów ją akceptuje, ile pod warunkami, ile nie, a o ilu nie wiemy.
 * Zakładki przełączają obszar (cała Polska / miasta); dane dla wszystkich obszarów przychodzą z serwera.
 */
export function CardComparison({ datasets }: { datasets: CardStatsDataset[] }) {
  const [open, setOpen] = useState(false);
  const [slug, setSlug] = useState(datasets[0]?.slug);
  const panelId = useId();
  const current = datasets.find((d) => d.slug === slug) ?? datasets[0];
  if (!current) return null;
  const { total } = current.stats;
  const rows = [...current.stats.providers].sort((a, b) => covered(b) - covered(a) || b.accepted - a.accepted);

  return (
    <section className="overflow-hidden rounded-3xl border border-white/70 bg-white/80 shadow-[0_30px_80px_-40px_rgba(30,64,175,0.35)] ring-1 ring-slate-900/5 backdrop-blur-xl">
      <h2>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-controls={panelId}
          className="flex w-full items-center gap-3 px-4 py-3.5 text-left transition hover:bg-white/60 sm:px-5"
        >
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-brand-500 to-violet-600 text-white shadow-md shadow-brand-600/25">
            <BarChart3 className="size-5" aria-hidden />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[15px] font-semibold tracking-tight text-ink sm:text-base">Która karta daje najwięcej {current.where}?</span>
            <span className="block truncate text-xs text-slate-500 sm:text-sm">Porównanie MultiSport, BeActive, Medicover Sport i PZU Sport</span>
          </span>
          <span className="flex shrink-0 items-center gap-1 text-sm font-medium text-brand-600">
            <span className="hidden sm:inline">{open ? 'Zwiń' : 'Pokaż'}</span>
            <ChevronDown className={`size-5 transition-transform duration-300 ${open ? 'rotate-180' : ''}`} aria-hidden />
          </span>
        </button>
      </h2>

      {/* grid-rows 0fr → 1fr: płynne rozwinięcie bez mierzenia wysokości w JS */}
      <div
        id={panelId}
        className={`grid transition-[grid-template-rows] duration-300 ease-out ${open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}
        inert={!open}
      >
        <div className="min-h-0 overflow-hidden">
          <div className="border-t border-slate-100 px-4 pb-5 pt-4 sm:px-5">
            <div role="tablist" aria-label="Obszar porównania" className="-mx-1 flex flex-wrap gap-1.5">
              {datasets.map((d) => {
                const active = d.slug === current.slug;
                return (
                  <button
                    key={d.slug}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    onClick={() => setSlug(d.slug)}
                    className={`rounded-full px-3 py-1.5 text-sm font-medium transition ${
                      active ? 'bg-ink text-white shadow-sm' : 'bg-slate-100 text-slate-600 hover:bg-slate-200 hover:text-ink'
                    }`}
                  >
                    {d.label}
                  </button>
                );
              })}
            </div>
            <p className="mt-3 text-sm text-slate-500">
              {total} {total === 1 ? 'obiekt' : 'obiektów'} {current.where} – kliknij kartę, żeby zobaczyć obiekty, które ją honorują.
            </p>

            <ul className="mt-4 space-y-4" role="tabpanel">
              {rows.map((p) => {
                const n = covered(p);
                return (
                  <li key={p.provider}>
                    <div className="mb-1.5 flex items-baseline justify-between gap-3">
                      <Link
                        href={buildSearchUrl(current.slug, { cards: [p.provider] })}
                        className="group inline-flex items-center gap-1.5 font-semibold text-ink hover:text-brand-700"
                      >
                        {providerName(p.provider)}
                        <ArrowRight
                          className="size-3.5 -translate-x-1 opacity-0 transition group-hover:translate-x-0 group-hover:opacity-100"
                          aria-hidden
                        />
                      </Link>
                      <span className="text-sm text-slate-500">
                        <span className="text-base font-semibold tabular-nums text-ink">{n}</span> / {total}
                        <span className="ml-1.5 tabular-nums">({pct(n, total)}%)</span>
                      </span>
                    </div>
                    <div
                      className="flex h-3 w-full gap-0.5 overflow-hidden rounded-full bg-slate-100"
                      role="img"
                      aria-label={`${providerName(p.provider)}: akceptuje ${p.accepted}, pod warunkami ${p.conditional}, nie akceptuje ${p.notAccepted}, brak danych ${p.unknown}`}
                    >
                      {SEGMENTS.map((s) => {
                        const value = p[s.key];
                        if (!value) return null;
                        return (
                          <span
                            key={s.key}
                            title={`${providerName(p.provider)} – ${s.label}: ${value} (${pct(value, total)}%)`}
                            className={`h-full transition-[width,filter] duration-500 first:rounded-l-full last:rounded-r-full hover:brightness-110 ${s.bar}`}
                            style={{ width: `${(value / total) * 100}%` }}
                          />
                        );
                      })}
                    </div>
                    <p className="mt-1 text-xs text-slate-500">
                      {p.accepted} akceptuje · {p.conditional} pod warunkami
                      {p.notAccepted > 0 && <> · {p.notAccepted} nie</>}
                      {p.unknown > 0 && <> · {p.unknown} brak danych</>}
                    </p>
                  </li>
                );
              })}
            </ul>

            <ul className="mt-5 flex flex-wrap gap-x-4 gap-y-1 border-t border-slate-100 pt-4 text-xs text-slate-600" aria-label="Legenda">
              {SEGMENTS.map((s) => (
                <li key={s.key} className="inline-flex items-center gap-1.5">
                  <span className={`size-2.5 rounded-full ${s.dot}`} aria-hidden />
                  {s.label}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}

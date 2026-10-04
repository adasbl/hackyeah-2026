'use client';

import { BarChart3, ChevronDown } from 'lucide-react';
import Link from 'next/link';
import { useId, useState } from 'react';
import type { CardCoverage, CardStatsResponse } from '@repo/types';
import { providerName } from '@/lib/catalog';
import { buildSearchUrl } from '@/lib/search-params';

export interface CardStatsDataset {
  slug: string;
  label: string;
  where: string;
  stats: CardStatsResponse;
}

const SEGMENTS = [
  { key: 'accepted', label: 'akceptuje', bar: 'bg-emerald-500' },
  { key: 'conditional', label: 'pod warunkami', bar: 'bg-amber-400' },
  { key: 'notAccepted', label: 'nie akceptuje', bar: 'bg-rose-400' },
  { key: 'unknown', label: 'brak danych', bar: 'bg-slate-200' },
] as const;

const pct = (n: number, total: number) => (total ? Math.round((n / total) * 100) : 0);
const covered = (p: CardCoverage) => p.accepted + p.conditional;
const number = (n: number) => n.toLocaleString('pl-PL');
const placeCount = (n: number) => n === 1 ? 'obiekt' : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14) ? 'obiekty' : 'obiektów';

export function CardComparison({ datasets }: { datasets: CardStatsDataset[] }) {
  const [open, setOpen] = useState(false);
  const [slug, setSlug] = useState(datasets[0]?.slug);
  const panelId = useId();
  const areaId = useId();
  const current = datasets.find((d) => d.slug === slug) ?? datasets[0];
  if (!current) return null;
  const { total } = current.stats;
  const rows = [...current.stats.providers].sort((a, b) => covered(b) - covered(a) || b.accepted - a.accepted);

  return (
    <section className="overflow-hidden rounded-2xl border border-white/70 bg-white/80 shadow-[0_30px_80px_-40px_rgba(30,64,175,0.35)] ring-1 ring-slate-900/5 backdrop-blur-xl">
      <h2>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-controls={panelId}
          className="flex w-full items-center gap-3 p-4 text-left transition hover:bg-white/60 sm:gap-4 sm:p-6"
        >
          <span className="grid size-11 shrink-0 place-items-center rounded-xl border border-slate-300 text-slate-500">
            <BarChart3 className="size-5" aria-hidden />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-base font-semibold text-ink sm:text-lg">Która karta daje najwięcej {current.where}?</span>
            <span className="mt-1 block text-sm font-normal leading-relaxed text-slate-500">Porównanie MultiSport, BeActive, Medicover Sport i PZU Sport</span>
          </span>
          <ChevronDown className={`size-5 shrink-0 text-slate-500 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden />
        </button>
      </h2>
      <div id={panelId} hidden={!open} className="border-t border-slate-100 p-4 sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0">
            <p className="text-sm leading-relaxed text-slate-500">{number(total)} {placeCount(total)} {current.where}</p>
          </div>
          <div className="w-full shrink-0 sm:w-64">
            <label htmlFor={areaId} className="sr-only">Obszar porównania</label>
            <select id={areaId} value={current.slug} onChange={(e) => setSlug(e.target.value)} className="min-h-11 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-base text-ink">
              {datasets.map((d) => <option key={d.slug} value={d.slug}>{d.label}</option>)}
            </select>
          </div>
        </div>
        <ul className="mt-6 grid gap-x-8 gap-y-5 lg:grid-cols-2">
          {rows.map((p) => {
            const n = covered(p);
            return (
              <li key={p.provider} className="min-w-0">
                <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
                  <Link href={buildSearchUrl(current.slug, { cards: [p.provider] })} className="font-semibold text-ink underline decoration-slate-300 underline-offset-4 hover:text-brand-700 hover:decoration-brand-600">
                    {providerName(p.provider)}
                  </Link>
                  <span className="text-sm tabular-nums text-slate-500"><span className="font-semibold text-ink">{number(n)}</span> / {number(total)} ({pct(n, total)}%)</span>
                </div>
                <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-slate-100" role="img" aria-label={`${providerName(p.provider)}: akceptuje ${p.accepted}, pod warunkami ${p.conditional}, nie akceptuje ${p.notAccepted}, brak danych ${p.unknown}`}>
                  {SEGMENTS.map((s) => p[s.key] > 0 ? (
                    <span key={s.key} title={`${s.label}: ${number(p[s.key])}`} className={`h-full ${s.bar}`} style={{ width: `${(p[s.key] / total) * 100}%` }} />
                  ) : null)}
                </div>
                <p className="mt-2 text-sm leading-relaxed text-slate-500">
                  {number(p.accepted)} akceptuje · {number(p.conditional)} pod warunkami
                  {p.notAccepted > 0 && <> · {number(p.notAccepted)} nie</>}
                  {p.unknown > 0 && <> · {number(p.unknown)} brak danych</>}
                </p>
              </li>
            );
          })}
        </ul>
        <ul className="mt-6 flex flex-wrap gap-x-5 gap-y-2 border-t border-slate-100 pt-4 text-sm text-slate-600" aria-label="Legenda">
          {SEGMENTS.map((s) => (
            <li key={s.key} className="inline-flex items-center gap-2"><span className={`size-2.5 rounded-sm ${s.bar}`} aria-hidden />{s.label}</li>
          ))}
        </ul>
      </div>
    </section>
  );
}

import { ArrowUpRight, MapPin } from 'lucide-react';
import Link from 'next/link';
import type { PlaceSummary } from '@repo/types';
import { CARD_PROVIDERS, categoryOf, formatPrice } from '@/lib/catalog';
import { CardStatusBadge } from './card-status-badge';
import { CategoryBadge } from './category-icon';

export function PlaceCard({ place }: { place: PlaceSummary }) {
  const category = categoryOf(place.category);
  // Stała kolejność kart, niezależnie od kolejności w danych
  const claims = CARD_PROVIDERS.map((p) => place.cards.find((c) => c.provider === p.slug)).filter((c) => c !== undefined);

  return (
    <Link
      href={`/places/${place.slug}`}
      className="group relative flex h-full flex-col overflow-hidden rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm transition duration-300 hover:-translate-y-1 hover:border-brand-500/30 hover:shadow-[0_20px_50px_-20px_rgba(30,64,175,0.35)]"
    >
      <span
        className={`pointer-events-none absolute -right-16 -top-16 size-40 rounded-full bg-gradient-to-br opacity-0 blur-2xl transition duration-500 group-hover:opacity-20 ${category.gradient}`}
        aria-hidden
      />
      <div className="flex items-start gap-4">
        <CategoryBadge category={place.category} />
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">{category.name}</p>
          <h3 className="mt-0.5 truncate text-[17px] font-semibold leading-snug text-ink">{place.name}</h3>
          <p className="mt-1 flex items-center gap-1 truncate text-sm text-slate-500">
            <MapPin className="size-3.5 shrink-0" aria-hidden />
            <span className="truncate">
              {[place.address.street, place.address.city].filter(Boolean).join(', ')}
            </span>
          </p>
        </div>
        <ArrowUpRight
          className="size-5 shrink-0 text-slate-300 transition duration-300 group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-brand-600"
          aria-hidden
        />
      </div>

      <div className="mt-4 flex flex-wrap gap-1.5">
        {claims.map((c) => (
          <CardStatusBadge key={c.provider} claim={c} />
        ))}
      </div>

      <div className="min-h-4 flex-1" />
      {place.priceFrom && (
        <div className="flex items-baseline justify-between border-t border-slate-100 pt-3">
          <span className="text-xs text-slate-500">{place.priceFrom.label}</span>
          <span className="text-sm text-slate-500">
            od <span className="text-base font-semibold tabular-nums text-ink">{formatPrice(place.priceFrom.amount)}</span>
          </span>
        </div>
      )}
    </Link>
  );
}

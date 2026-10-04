import { MapPin, Navigation } from 'lucide-react';
import Link from 'next/link';
import type { PlaceSummary } from '@repo/types';
import { CARD_PROVIDERS, categoryOf, formatPrice } from '@/lib/catalog';
import { formatDistance } from '@/lib/geo';
import { CardStatusBadge } from './card-status-badge';
import { CategoryBadge } from './category-icon';
import { FavoriteButton } from './favorites/favorite-button';
import { OpenStatus } from './open-status';

export function PlaceCard({ place }: { place: PlaceSummary }) {
  const category = categoryOf(place.category);
  // Stała kolejność kart, niezależnie od kolejności w danych
  const claims = CARD_PROVIDERS.map((p) => place.cards.find((c) => c.provider === p.slug)).filter((c) => c !== undefined);

  // Serduszko jest przyciskiem OBOK linku (nie w środku) – przycisk w <a> to niepoprawny HTML.
  return (
    <article className="group relative h-full min-w-0 rounded-2xl border border-slate-200 bg-white shadow-sm transition hover:border-brand-500/50 hover:shadow-md hover:shadow-slate-900/5">
      <Link href={`/places/${place.slug}`} className="flex h-full min-w-0 flex-col rounded-[inherit] p-4">
        <div className="flex items-center gap-3 pr-9">
          <CategoryBadge category={place.category} size="sm" />
          <p className="min-w-0 text-sm font-medium text-slate-500">{category.name}</p>
        </div>
        <h2 className="mt-3 text-lg font-semibold leading-snug text-ink group-hover:text-brand-700">{place.name}</h2>
        <p className="mt-2 flex items-start gap-1.5 text-sm leading-relaxed text-slate-600">
          <MapPin className="mt-1 size-3.5 shrink-0" aria-hidden />
          <span>{[place.address.street, place.address.city].filter(Boolean).join(', ')}</span>
        </p>

        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1">
          <OpenStatus hours={place.openingHours} />
          {place.distanceMeters !== undefined && (
            <span className="inline-flex items-center gap-1 text-sm font-medium text-brand-700">
              <Navigation className="size-3.5" aria-hidden />
              {formatDistance(place.distanceMeters)}
              <span className="sr-only"> od Ciebie</span>
            </span>
          )}
        </div>

        <div className="mt-4 border-t border-slate-100 pt-3">
          <div className="flex flex-wrap gap-2 xl:grid xl:grid-cols-2">
            {claims.map((c) => (
              <CardStatusBadge key={c.provider} claim={c} />
            ))}
          </div>
        </div>

        <div className="min-h-4 flex-1" />
        {place.priceFrom && (
          <div className="flex flex-wrap items-baseline justify-between gap-2 border-t border-slate-100 pt-3">
            <span className="text-sm text-slate-500">{place.priceFrom.label}</span>
            <span className="text-sm text-slate-500">
              od <span className="text-base font-semibold tabular-nums text-ink">{formatPrice(place.priceFrom.amount)}</span>
            </span>
          </div>
        )}
      </Link>
      <FavoriteButton slug={place.slug} name={place.name} className="absolute right-3 top-3" />
    </article>
  );
}

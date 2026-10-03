import { ExternalLink, Globe, Navigation, Phone } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { connection } from 'next/server';
import { CardStatusBadge } from '@/components/card-status-badge';
import { Backdrop } from '@/components/backdrop';
import { CategoryBadge } from '@/components/category-icon';
import { FavoriteButton } from '@/components/favorites/favorite-button';
import { BackButton } from '@/components/navigation/back-button';
import { PlaceMiniMapLazy } from '@/components/map/places-map-lazy';
import { OpenStatus } from '@/components/open-status';
import {
  CARD_PROVIDERS,
  categoryOf,
  CONFIDENCE_LABEL,
  formatDate,
  formatPrice,
  isExpired,
  providerName,
  SOURCE_TYPE_LABEL,
} from '@/lib/catalog';
import { getPlaceBySlug } from '@/lib/data/places';
import { entryCoversDay, warsawDayIndex } from '@/lib/opening-hours';

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const place = await getPlaceBySlug((await params).slug);
  if (!place) return { title: 'Nie znaleziono obiektu' };
  return {
    title: `${place.name} – ${place.address.city}`,
    description: `${categoryOf(place.category).name}, ${place.address.street}, ${place.address.city}. Akceptacja kart sportowych, ceny i godziny otwarcia.`,
  };
}

export default async function PlaceDetailsPage({ params }: Props) {
  // Status „otwarte teraz” zależy od chwili wejścia – strona nie może być zbudowana raz i zapamiętana.
  await connection();
  const place = await getPlaceBySlug((await params).slug);
  if (!place) notFound();

  const category = categoryOf(place.category);
  const claims = CARD_PROVIDERS.map((p) => place.cards.find((c) => c.provider === p.slug)).filter((c) => c !== undefined);
  const { lat, lng } = place.location;
  const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
  const directionsUrl = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
  const today = warsawDayIndex();

  return (
    <div className="relative isolate">
    <Backdrop />
    <div className="mx-auto max-w-5xl px-4 py-8">
      <div className="mb-5 flex flex-wrap items-center gap-x-4 gap-y-3">
      <BackButton fallbackHref={`/${place.address.citySlug}`} label="Wróć do wyników" />
      <nav className="text-sm text-slate-500" aria-label="Okruszki">
        <Link href="/" className="hover:text-ink">Start</Link>
        <span className="mx-1.5">/</span>
        <Link href={`/${place.address.citySlug}`} className="hover:text-ink">{place.address.city}</Link>
        <span className="mx-1.5">/</span>
        <span className="text-slate-700">{place.name}</span>
      </nav>
      </div>

      <header className="flex animate-fade-up flex-wrap items-start gap-4">
        <CategoryBadge category={place.category} size="lg" />
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{category.name}</p>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{place.name}</h1>
          <p className="mt-1 text-slate-600">
            {place.address.street}, {place.address.postalCode} {place.address.city}
          </p>
          <OpenStatus hours={place.openingHours} className="mt-2" />
        </div>
        <FavoriteButton slug={place.slug} name={place.name} variant="pill" />
      </header>

      {place.description && <p className="mt-4 max-w-2xl text-slate-700">{place.description}</p>}

      <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_300px]">
        <section aria-labelledby="cards-h" className="rounded-3xl border border-slate-200/80 bg-white p-6 shadow-sm">
          <h2 id="cards-h" className="text-lg font-semibold">Karty sportowe</h2>
          <p className="mb-4 text-sm text-slate-500">Status, warunki, źródło i data ostatniej weryfikacji.</p>

          <ul className="divide-y divide-slate-100">
            {claims.map((c) => {
              const expired = isExpired(c.expiresAt);
              return (
                <li key={c.provider} className="py-4 first:pt-0 last:pb-0">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="font-semibold">{providerName(c.provider)}</h3>
                    <CardStatusBadge claim={c} size="md" />
                  </div>

                  {c.conditions && (
                    <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
                      <span className="font-medium">Warunki:</span> {c.conditions}
                    </p>
                  )}
                  {c.sourceQuote && (
                    <blockquote className="mt-2 border-l-2 border-slate-300 pl-3 text-sm italic text-slate-600">„{c.sourceQuote}”</blockquote>
                  )}

                  {c.status === 'unknown' && !c.verifiedAt ? (
                    <p className="mt-2 text-sm text-slate-500">Nie mamy jeszcze zweryfikowanej informacji o tej karcie.</p>
                  ) : (
                    <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
                      <dt className="text-slate-500">Źródło</dt>
                      <dd>
                        {SOURCE_TYPE_LABEL[c.sourceType]}
                        {c.sourceUrl && (
                          <>
                            {' · '}
                            <a href={c.sourceUrl} target="_blank" rel="noopener noreferrer" className="text-brand-700 hover:underline">
                              zobacz
                            </a>
                          </>
                        )}
                      </dd>
                      <dt className="text-slate-500">Pewność</dt>
                      <dd>{CONFIDENCE_LABEL[c.confidence]}</dd>
                      {c.verifiedAt && (
                        <>
                          <dt className="text-slate-500">Zweryfikowano</dt>
                          <dd>{formatDate(c.verifiedAt)}</dd>
                        </>
                      )}
                    </dl>
                  )}

                  {expired && (
                    <p className="mt-2 text-sm font-medium text-amber-700">
                      ⏱ Informacja wygasła {formatDate(c.expiresAt!)} i wymaga ponownej weryfikacji.
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        </section>

        <aside className="space-y-6">
          <section aria-labelledby="contact-h" className="overflow-hidden rounded-3xl border border-slate-200/80 bg-white shadow-sm">
            <div className="h-56 border-b border-slate-200/80">
              <PlaceMiniMapLazy name={place.name} category={place.category} location={place.location} />
            </div>
            <div className="p-6">
            <h2 id="contact-h" className="mb-3 font-semibold">Kontakt i dojazd</h2>
            <ul className="space-y-2 text-sm">
              {place.phone && (
                <li className="flex items-center gap-2">
                  <Phone className="size-4 text-slate-400" aria-hidden />
                  <a href={`tel:${place.phone.replace(/\s/g, '')}`} className="hover:underline">{place.phone}</a>
                </li>
              )}
              {place.website && (
                <li className="flex items-center gap-2">
                  <Globe className="size-4 text-slate-400" aria-hidden />
                  <a href={place.website} target="_blank" rel="noopener noreferrer" className="text-brand-700 hover:underline">
                    Strona obiektu
                  </a>
                </li>
              )}
            </ul>
            <div className="mt-4 space-y-2">
              <a
                href={directionsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-gradient-to-br from-brand-500 to-violet-600 px-3 py-2.5 text-sm font-semibold text-white shadow-md shadow-brand-600/25 transition hover:shadow-lg active:scale-[0.98]"
              >
                <Navigation className="size-4" aria-hidden />
                Wyznacz trasę
              </a>
              <a
                href={mapsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:text-ink"
              >
                <ExternalLink className="size-4" aria-hidden />
                Otwórz w Google Maps
              </a>
            </div>
            </div>
          </section>

          <section aria-labelledby="hours-h" className="rounded-3xl border border-slate-200/80 bg-white p-6 shadow-sm">
            <h2 id="hours-h" className="mb-3 font-semibold">Godziny otwarcia</h2>
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
              {place.openingHours.map((h) => {
                const isToday = entryCoversDay(h, today);
                return (
                  <div key={h.days} className="contents">
                    <dt className={isToday ? 'font-semibold text-ink' : 'text-slate-500'}>
                      {h.days}
                      {isToday && <span className="ml-1.5 rounded bg-brand-50 px-1.5 py-0.5 text-[11px] font-semibold text-brand-700">dziś</span>}
                    </dt>
                    <dd className={`tabular-nums ${isToday ? 'font-semibold' : ''}`}>{h.hours}</dd>
                  </div>
                );
              })}
            </dl>
          </section>

          <section aria-labelledby="prices-h" className="rounded-3xl border border-slate-200/80 bg-white p-6 shadow-sm">
            <h2 id="prices-h" className="mb-3 font-semibold">Orientacyjne ceny</h2>
            <ul className="space-y-1.5 text-sm">
              {place.prices.map((p) => (
                <li key={p.label} className="flex justify-between gap-3">
                  <span className="text-slate-600">
                    {p.label}
                    {p.note && <span className="text-slate-400"> ({p.note})</span>}
                  </span>
                  <span className="font-medium tabular-nums">{formatPrice(p.amount)}</span>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-xs text-slate-400">Ceny mogą się zmienić. Aktualizacja: {formatDate(place.updatedAt)}.</p>
          </section>

          {place.amenities.length > 0 && (
            <section aria-labelledby="amen-h" className="rounded-3xl border border-slate-200/80 bg-white p-6 shadow-sm">
              <h2 id="amen-h" className="mb-3 font-semibold">Udogodnienia</h2>
              <ul className="flex flex-wrap gap-1.5">
                {place.amenities.map((a) => (
                  <li key={a} className="rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-700">{a}</li>
                ))}
              </ul>
            </section>
          )}
        </aside>
      </div>
    </div>
    </div>
  );
}

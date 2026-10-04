import Link from 'next/link';
import { requireAdmin } from '@/lib/supabase/admin';
import { REVIEW_LABELS, REVIEW_STATUSES, type ReviewStatus } from '@/lib/admin';
import { providerName, STATUS_META } from '@/lib/catalog';
import type { CardStatus } from '@repo/types';
import { createModerationService } from '@/server/moderation';
import { ReviewForm } from '@/components/admin/review-form';
import { RefreshButton } from '@/components/admin/refresh-button';
import { logout } from './actions';

const dateFormat = new Intl.DateTimeFormat('pl-PL', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Europe/Warsaw' });

function ClaimDetails({ claim }: { claim: { status: CardStatus; conditions: string | null; sourceUrl: string | null } | null }) {
  const source = claim?.sourceUrl;
  const safeSource = source && /^https?:\/\//i.test(source) ? source : null;
  return <div className="mt-2 space-y-2 break-words text-sm">
    <p className="font-semibold">{STATUS_META[claim?.status ?? 'unknown'].label}</p>
    <p className="whitespace-pre-wrap text-slate-600">{claim?.conditions || 'Brak dodatkowych warunków.'}</p>
    {safeSource ? <a href={safeSource} target="_blank" rel="noopener noreferrer" className="block break-all text-brand-700 underline underline-offset-2">{safeSource}</a> : <p className="text-slate-500">Brak linku do źródła.</p>}
  </div>;
}

export default async function AdminPage({ searchParams }: { searchParams: Promise<{ status?: string; page?: string }> }) {
  const admin = await requireAdmin();
  const params = await searchParams;
  const status: ReviewStatus = REVIEW_STATUSES.includes(params.status as ReviewStatus) ? params.status as ReviewStatus : 'pending';
  const number = Number(params.page ?? 1);
  const page = Number.isSafeInteger(number) && number > 0 && number <= 100000 ? number : 1;
  const { db } = await import('@/db/client');
  const { items, hasMore } = await createModerationService(db).list(admin.id, status, page);

  return <>
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div><h1 className="text-3xl font-bold">Zgłoszenia społeczności</h1><p className="mt-2 text-slate-600">Porównaj informacje i zdecyduj, co pojawi się na stronie.</p></div>
      <form action={logout}><p className="mb-1 max-w-xs break-all text-xs text-slate-500">{admin.email}</p><button className="min-h-11 text-sm font-medium text-slate-600 underline underline-offset-4 hover:text-brand-700">Wyloguj się</button></form>
    </div>
    <nav aria-label="Status zgłoszeń" className="my-6 flex flex-wrap gap-2">
      {REVIEW_STATUSES.map((value) => <Link key={value} href={`/admin?status=${value}`} aria-current={status === value ? 'page' : undefined} className={`inline-flex min-h-11 items-center rounded-xl px-4 py-2 text-sm font-semibold ${status === value ? 'bg-brand-600 text-white' : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}`}>{REVIEW_LABELS[value]}</Link>)}
      <RefreshButton />
    </nav>
    {items.length === 0 ? <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center text-slate-600">{status === 'pending' ? 'Brak zgłoszeń oczekujących na sprawdzenie.' : 'Brak zgłoszeń na tej stronie historii.'}</div> : null}
    <div className="space-y-5">
      {items.map(({ contribution, place, currentClaim }) => <article key={contribution.id} className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div><h2 className="text-lg font-bold"><Link href={`/places/${place.slug}`} className="hover:text-brand-700 hover:underline">{place.name}</Link></h2><p className="mt-1 text-sm text-slate-600">{providerName(contribution.provider)}{place.city ? ` · ${place.city}` : ''}</p></div>
          <p className="text-xs text-slate-500">Zgłoszono {dateFormat.format(contribution.createdAt)}</p>
        </div>
        {!place.isPublished ? <p className="mt-3 text-sm text-amber-800">Obiekt nie jest opublikowany — nie można zatwierdzić zmiany.</p> : null}
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <section className="rounded-xl bg-slate-50 p-4"><h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">{status === 'pending' ? 'Aktualnie na stronie' : 'Przed decyzją'}</h3><ClaimDetails claim={status === 'pending' ? currentClaim : contribution.previousClaim} /></section>
          <section className="rounded-xl bg-brand-50/60 p-4"><h3 className="text-xs font-semibold uppercase tracking-wide text-brand-700">Proponowana zmiana</h3><ClaimDetails claim={contribution} /></section>
        </div>
        {status === 'pending' ? <ReviewForm id={contribution.id} expectedUpdatedAt={place.updatedAt.toISOString()} canApprove={place.isPublished} /> : <div className="mt-4 space-y-1 break-words text-sm text-slate-600">
          <p>{status === 'approved' ? 'Zatwierdzono' : 'Odrzucono'} {contribution.reviewedAt ? dateFormat.format(contribution.reviewedAt) : ''}</p>
          <p className="break-all text-xs text-slate-500">Administrator: {contribution.reviewedBy}</p>        </div>}
      </article>)}
    </div>
    <nav aria-label="Strony zgłoszeń" className="mt-6 flex items-center justify-between gap-4 text-sm">
      {page > 1 ? <Link href={`/admin?status=${status}&page=${page - 1}`} className="inline-flex min-h-11 items-center text-brand-700 underline">Poprzednia strona</Link> : <span />}
      <span className="text-slate-500">Strona {page}</span>
      {hasMore ? <Link href={`/admin?status=${status}&page=${page + 1}`} className="inline-flex min-h-11 items-center text-brand-700 underline">Następna strona</Link> : <span />}
    </nav>
  </>;
}

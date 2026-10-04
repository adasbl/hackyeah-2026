'use client';

import { useActionState, useId, useState } from 'react';
import { PencilLine } from 'lucide-react';
import type { CardClaim, CardProviderSlug } from '@repo/types';
import { CARD_PROVIDERS, providerName } from '@/lib/catalog';
import { saveCardContribution } from '@/lib/data/card-contribution-actions';

export function CardContributionForm({ placeSlug, cards }: { placeSlug: string; cards: CardClaim[] }) {
  const [provider, setProvider] = useState<CardProviderSlug>('multisport');

  return (
    <details className="mt-6 rounded-xl border border-brand-100 bg-brand-50/50">
      <summary className="flex min-h-11 cursor-pointer items-center gap-2 px-4 py-3 text-sm font-semibold text-brand-700">
        <PencilLine className="size-4 shrink-0" aria-hidden />
        Uzupełnij informacje o kartach
      </summary>
      <div className="border-t border-brand-100 p-4">
        <p className="mb-4 text-sm text-slate-600">Wiesz, jakie karty honoruje ten obiekt? Dodaj lub popraw informację. Zmiana będzie widoczna od razu jako zgłoszenie społeczności.</p>
        <ContributionFields key={provider} placeSlug={placeSlug} provider={provider} onProviderChange={setProvider} claim={cards.find((card) => card.provider === provider)} />
      </div>
    </details>
  );
}

function ContributionFields({ placeSlug, provider, onProviderChange, claim }: { placeSlug: string; provider: CardProviderSlug; onProviderChange: (provider: CardProviderSlug) => void; claim?: CardClaim }) {
  const id = useId();
  const [state, action, pending] = useActionState(saveCardContribution, { success: false, message: '' });
  const [status, setStatus] = useState(claim?.status === 'unknown' ? '' : claim?.status ?? '');
  const [conditions, setConditions] = useState(claim?.conditions ?? '');
  const [sourceUrl, setSourceUrl] = useState(claim?.sourceUrl ?? '');
  const inputClass = 'min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm';

  return (
    <form action={action} className="space-y-4" aria-label={`Informacje o karcie ${providerName(provider)}`}>
      <input type="hidden" name="placeSlug" value={placeSlug} />
      <fieldset disabled={pending} className="space-y-4 disabled:opacity-60">
        <div>
          <label htmlFor={`${id}-provider`} className="mb-1 block text-sm font-medium">Karta sportowa</label>
          <select id={`${id}-provider`} name="provider" value={provider} onChange={(event) => onProviderChange(event.target.value as CardProviderSlug)} className={inputClass}>
            {CARD_PROVIDERS.map((card) => <option key={card.slug} value={card.slug}>{card.name}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor={`${id}-status`} className="mb-1 block text-sm font-medium">Czy obiekt honoruje tę kartę?</label>
          <select id={`${id}-status`} name="status" value={status} onChange={(event) => setStatus(event.target.value as typeof status)} required className={inputClass} aria-invalid={!!state.errors?.status} aria-describedby={state.errors?.status ? `${id}-status-error` : undefined}>
            <option value="" disabled>Wybierz status</option>
            <option value="accepted">Tak, honoruje</option>
            <option value="conditional">Tak, pod warunkami</option>
            <option value="not_accepted">Nie honoruje</option>
          </select>
          {state.errors?.status && <p id={`${id}-status-error`} className="mt-1 text-sm text-rose-700">{state.errors.status}</p>}
        </div>
        <div>
          <label htmlFor={`${id}-conditions`} className="mb-1 block text-sm font-medium">Warunki wejścia {status !== 'conditional' && <span className="font-normal text-slate-500">(opcjonalnie)</span>}</label>
          <textarea id={`${id}-conditions`} name="conditions" value={conditions} onChange={(event) => setConditions(event.target.value)} required={status === 'conditional'} maxLength={1000} rows={3} placeholder="Np. dopłata 10 zł, tylko do godziny 16:00, wymagane rezerwacje" className={inputClass} aria-invalid={!!state.errors?.conditions} aria-describedby={state.errors?.conditions ? `${id}-conditions-error` : undefined} />
          {state.errors?.conditions && <p id={`${id}-conditions-error`} className="mt-1 text-sm text-rose-700">{state.errors.conditions}</p>}
        </div>
        <div>
          <label htmlFor={`${id}-source`} className="mb-1 block text-sm font-medium">Link do źródła <span className="font-normal text-slate-500">(opcjonalnie)</span></label>
          <input id={`${id}-source`} name="sourceUrl" type="url" value={sourceUrl} onChange={(event) => setSourceUrl(event.target.value)} maxLength={2000} placeholder="https://…" className={inputClass} aria-invalid={!!state.errors?.sourceUrl} aria-describedby={state.errors?.sourceUrl ? `${id}-source-error` : undefined} />
          {state.errors?.sourceUrl && <p id={`${id}-source-error`} className="mt-1 text-sm text-rose-700">{state.errors.sourceUrl}</p>}
        </div>
        <button type="submit" className="min-h-11 rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-700 disabled:cursor-wait">{pending ? 'Zapisywanie…' : 'Zapisz informację'}</button>
      </fieldset>
      {state.message && <p role={state.success ? 'status' : 'alert'} className={`text-sm ${state.success ? 'text-emerald-800' : 'text-rose-700'}`}>{state.message}</p>}
    </form>
  );
}

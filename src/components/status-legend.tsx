import { CARD_STATUSES } from '@repo/types';
import { STATUS_META } from '@/lib/catalog';

export function StatusLegend() {
  return (
    <ul className="grid gap-2 sm:grid-cols-2">
      {CARD_STATUSES.map((s) => (
        <li key={s} className="flex items-start gap-2 text-sm">
          <span className={`mt-1.5 size-2 shrink-0 rounded-full ${STATUS_META[s].dot}`} aria-hidden />
          <span>
            <span className="font-medium">{STATUS_META[s].label}</span>
            <span className="text-slate-500"> – {STATUS_META[s].description}</span>
          </span>
        </li>
      ))}
      <li className="flex items-start gap-2 text-sm sm:col-span-2">
        <span className="mt-0.5 shrink-0" aria-hidden>⏱</span>
        <span className="text-slate-500">Informacja starsza niż termin ważności, wymaga ponownej weryfikacji.</span>
      </li>
    </ul>
  );
}

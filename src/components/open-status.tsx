import { Clock } from 'lucide-react';
import type { OpeningHoursEntry } from '@repo/types';
import { getOpenStatus } from '@/lib/opening-hours';

/** „Otwarte · do 22:00” / „Zamknięte · otwarcie jutro 6:00”. Liczone w chwili renderu (czas Warszawy). */
export function OpenStatus({ hours, className = '' }: { hours: OpeningHoursEntry[]; className?: string }) {
  const status = getOpenStatus(hours);
  if (!status) return null;
  return (
    <span className={`inline-flex items-center gap-1.5 text-sm ${className}`}>
      <Clock className={`size-3.5 shrink-0 ${status.open ? 'text-emerald-600' : 'text-slate-400'}`} aria-hidden />
      <span className={`font-medium ${status.open ? 'text-emerald-700' : 'text-slate-600'}`}>{status.open ? 'Otwarte' : 'Zamknięte'}</span>
      {status.label !== 'Zamknięte' && <span className="text-slate-500">· {status.open && !status.allDay ? status.label : status.label.toLowerCase()}</span>}
    </span>
  );
}

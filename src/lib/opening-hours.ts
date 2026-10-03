/**
 * Godziny otwarcia w prostym formacie z kontraktu API: [{ days: 'pon–pt', hours: '6:00–22:00' }].
 * Dni: pon, wt, śr, czw, pt, sob, niedz (pojedynczo lub zakres „pon–pt”, także z przecinkami).
 * Godziny: „6:00–22:00”, „0:00–24:00” (całą dobę), „zamknięte”; zakres przez północ („18:00–2:00”) też działa.
 * Czas liczymy zawsze w strefie Europe/Warsaw – niezależnie od strefy serwera (Vercel działa w UTC).
 */
import type { OpeningHoursEntry } from '@repo/types';

const TIME_ZONE = 'Europe/Warsaw';
const DAY_TOKENS = ['pon', 'wt', 'sr', 'czw', 'pt', 'sob', 'niedz'] as const;
const DAY_SHORT = ['pon.', 'wt.', 'śr.', 'czw.', 'pt.', 'sob.', 'niedz.'];
const DAY_ALIASES: Record<string, number> = { pn: 0, po: 0, sr: 2, cz: 3, so: 5, nd: 6, nie: 6, niedziela: 6 };
const MINUTES_PER_DAY = 24 * 60;

/** Przedział w minutach od początku tygodnia (pon 0:00 = 0). */
type Interval = [start: number, end: number];

function dayIndex(token: string): number | null {
  const t = token.trim().toLowerCase().replace('ś', 's').replace(/\.$/, '');
  const i = (DAY_TOKENS as readonly string[]).indexOf(t);
  if (i >= 0) return i;
  return DAY_ALIASES[t] ?? null;
}

/** „pon–pt” → [0,1,2,3,4]; „sob–niedz” → [5,6]; „pon, śr, pt” → [0,2,4]. */
export function parseDays(days: string): number[] | null {
  const out = new Set<number>();
  for (const part of days.split(',')) {
    const [a, b] = part.split(/[–—-]/);
    const from = dayIndex(a ?? '');
    if (from === null) return null;
    const to = b === undefined ? from : dayIndex(b);
    if (to === null) return null;
    for (let d = from; ; d = (d + 1) % 7) {
      out.add(d);
      if (d === to) break;
    }
  }
  return [...out];
}

function parseTime(t: string): number | null {
  const m = /^(\d{1,2})(?::(\d{2}))?$/.exec(t.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2] ?? 0);
  if (h > 24 || min > 59 || (h === 24 && min > 0)) return null;
  return h * 60 + min;
}

/** „6:00–22:00” → [360, 1320]; „zamknięte” → null; niepoprawne → undefined. */
function parseHours(hours: string): Interval | null | undefined {
  if (/zamkni/i.test(hours)) return null;
  const [a, b] = hours.split(/[–—-]/);
  if (a === undefined || b === undefined) return undefined;
  const open = parseTime(a);
  const close = parseTime(b);
  if (open === null || close === null) return undefined;
  // Zamknięcie po północy, np. 18:00–2:00 → do 26:00 tego samego dnia.
  return [open, close <= open ? close + MINUTES_PER_DAY : close];
}

/** Zamienia godziny na przedziały tygodnia. null = format, którego nie umiemy odczytać. */
export function weeklyIntervals(entries: OpeningHoursEntry[]): Interval[] | null {
  const intervals: Interval[] = [];
  for (const e of entries) {
    const days = parseDays(e.days);
    const hours = parseHours(e.hours);
    if (!days || hours === undefined) return null;
    if (hours === null) continue;
    for (const d of days) intervals.push([d * MINUTES_PER_DAY + hours[0], d * MINUTES_PER_DAY + hours[1]]);
  }
  return intervals;
}

const partsFmt = new Intl.DateTimeFormat('en-GB', {
  timeZone: TIME_ZONE,
  weekday: 'short',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});
const WEEKDAYS_EN = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/** Minuta tygodnia w Warszawie (pon 0:00 = 0). */
export function warsawWeekMinute(now = new Date()) {
  const parts = Object.fromEntries(partsFmt.formatToParts(now).map((p) => [p.type, p.value]));
  return WEEKDAYS_EN.indexOf(parts.weekday) * MINUTES_PER_DAY + Number(parts.hour) * 60 + Number(parts.minute);
}

/** Dzisiejszy dzień tygodnia w Warszawie (0 = poniedziałek). */
export const warsawDayIndex = (now = new Date()) => Math.floor(warsawWeekMinute(now) / MINUTES_PER_DAY);

const WEEK = 7 * MINUTES_PER_DAY;

/** Czy minuta tygodnia `t` mieści się w przedziale (z zawinięciem niedziela → poniedziałek). */
const contains = ([s, e]: Interval, t: number) => (t >= s && t < e) || (t + WEEK >= s && t + WEEK < e);

const formatClock = (minuteOfWeek: number) => {
  const m = ((minuteOfWeek % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`;
};

export type OpenStatus =
  | { open: true; allDay: boolean; label: string }
  | { open: false; label: string }
  | null;

/**
 * Status „teraz”: otwarte / zamknięte + krótki opis („do 22:00”, „otwarcie jutro 6:00”).
 * null, gdy godzin nie da się odczytać – wtedy niczego nie obiecujemy.
 */
export function getOpenStatus(entries: OpeningHoursEntry[], now = new Date()): OpenStatus {
  const intervals = weeklyIntervals(entries);
  if (!intervals || intervals.length === 0) return intervals ? { open: false, label: 'Zamknięte' } : null;
  const t = warsawWeekMinute(now);

  const current = intervals.filter((iv) => contains(iv, t));
  if (current.length) {
    // Koniec bieżącego otwarcia – sklejamy przedziały stykające się ze sobą (np. 0:00–24:00 dzień po dniu).
    let end = Math.max(...current.map(([s, e]) => (t >= s ? e : e - WEEK)));
    for (let guard = 0; guard < 8; guard++) {
      const next = intervals.find(([s, e]) => s <= end % WEEK && e > end % WEEK);
      if (!next) break;
      end += next[1] - (end % WEEK);
    }
    if (end - t >= WEEK - 1) return { open: true, allDay: true, label: 'Całą dobę' };
    return { open: true, allDay: false, label: `do ${formatClock(end)}` };
  }

  // Najbliższe otwarcie w ciągu tygodnia.
  const starts = intervals.map(([s]) => (s > t ? s : s + WEEK));
  const next = Math.min(...starts);
  const today = Math.floor(t / MINUTES_PER_DAY);
  const day = Math.floor(next / MINUTES_PER_DAY);
  const when = day === today ? 'dziś' : day === today + 1 ? 'jutro' : DAY_SHORT[day % 7];
  return { open: false, label: `otwarcie ${when} ${formatClock(next)}` };
}

export const isOpenNow = (entries: OpeningHoursEntry[], now = new Date()) => getOpenStatus(entries, now)?.open === true;

/** Czy wpis godzin dotyczy podanego dnia (do wyróżnienia „dziś” w tabeli godzin). */
export const entryCoversDay = (entry: OpeningHoursEntry, day: number) => parseDays(entry.days)?.includes(day) ?? false;

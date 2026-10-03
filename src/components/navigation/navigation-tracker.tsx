'use client';

/**
 * Zapamiętuje, czy użytkownik przeszedł już jakąś stronę wewnątrz aplikacji.
 * Dzięki temu przycisk „Wróć” wie, czy może bezpiecznie zrobić history.back()
 * (wraca do wyników z tymi samymi filtrami i widokiem), czy ktoś wszedł z zewnątrz
 * – wtedy prowadzi na stronę miasta zamiast wyrzucać poza serwis.
 */
import { usePathname } from 'next/navigation';
import { useEffect } from 'react';

let firstPath: string | null = null;
let movedInsideApp = false;

export const canGoBackInApp = () => movedInsideApp;

export function NavigationTracker() {
  const pathname = usePathname();
  useEffect(() => {
    if (firstPath === null) firstPath = pathname;
    else if (pathname !== firstPath) movedInsideApp = true;
  }, [pathname]);
  return null;
}

'use client';

import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { canGoBackInApp } from './navigation-tracker';

/** „Wróć” – do poprzedniej strony w serwisie (z zachowanymi filtrami), a po wejściu z zewnątrz – do `fallbackHref`. */
export function BackButton({ fallbackHref, label = 'Wróć' }: { fallbackHref: string; label?: string }) {
  const router = useRouter();
  return (
    <Link
      href={fallbackHref}
      onClick={(e) => {
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return; // nowa karta – zwykły link
        if (canGoBackInApp()) {
          e.preventDefault();
          router.back();
        }
      }}
      className="group inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white/90 py-2 pl-3 pr-4 text-sm font-semibold text-slate-700 shadow-sm backdrop-blur transition hover:border-slate-300 hover:text-ink active:scale-[0.98]"
    >
      <ArrowLeft className="size-4 transition group-hover:-translate-x-0.5" aria-hidden />
      {label}
    </Link>
  );
}

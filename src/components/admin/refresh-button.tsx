'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';

export function RefreshButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return <button onClick={() => startTransition(() => router.refresh())} disabled={pending} className="ml-auto min-h-11 text-sm text-brand-700 underline underline-offset-4 disabled:opacity-50">{pending ? 'Odświeżanie…' : 'Odśwież listę'}</button>;
}

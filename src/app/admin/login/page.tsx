import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ShieldCheck } from 'lucide-react';
import { AdminLoginForm } from '@/components/admin/login-form';
import { getAdmin } from '@/lib/supabase/admin';
import { getSupabaseConfig } from '@/lib/supabase/config';

export default async function AdminLoginPage() {
  if (await getAdmin()) redirect('/admin');
  return (
    <section className="mx-auto max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
      <div className="mb-5 flex size-12 items-center justify-center rounded-xl bg-brand-50 text-brand-700"><ShieldCheck className="size-6" aria-hidden /></div>
      <h1 className="text-2xl font-bold text-slate-900">Panel administratora</h1>
      <p className="mt-2 text-sm leading-relaxed text-slate-600">Zaloguj się, aby sprawdzać zgłoszenia i zatwierdzać informacje o kartach sportowych.</p>
      {getSupabaseConfig() ? <AdminLoginForm /> : <p role="status" className="mt-6 rounded-xl bg-amber-50 p-4 text-sm text-amber-900">Logowanie nie jest jeszcze dostępne. Panel oczekuje na konfigurację przez właściciela serwisu.</p>}
      <Link href="/" className="mt-6 inline-flex min-h-11 items-center text-sm text-slate-600 underline underline-offset-4 hover:text-brand-700">Wróć do wyszukiwarki</Link>
    </section>
  );
}

'use client';

import { useActionState } from 'react';
import { login } from '@/app/admin/actions';

export function AdminLoginForm() {
  const [state, action, pending] = useActionState(login, { success: false, message: '' });
  const inputClass = 'min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 py-2';
  return (
    <form action={action} className="mt-6 space-y-5">
      <fieldset disabled={pending} className="space-y-5 disabled:opacity-60">
        <div>
          <label htmlFor="admin-email" className="mb-1.5 block text-sm font-medium">Adres e-mail</label>
          <input id="admin-email" name="email" type="email" autoComplete="username" required maxLength={254} className={inputClass} />
        </div>
        <div>
          <label htmlFor="admin-password" className="mb-1.5 block text-sm font-medium">Hasło</label>
          <input id="admin-password" name="password" type="password" autoComplete="current-password" required maxLength={1024} className={inputClass} />
        </div>
        <button type="submit" className="min-h-11 w-full rounded-xl bg-brand-600 px-4 py-3 font-semibold text-white hover:bg-brand-700 disabled:cursor-wait">
          {pending ? 'Logowanie…' : 'Zaloguj się'}
        </button>
      </fieldset>
      {state.message ? <p role="alert" className="text-sm text-rose-700">{state.message}</p> : null}
    </form>
  );
}

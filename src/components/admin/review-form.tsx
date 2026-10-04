'use client';

import { useActionState } from 'react';
import { reviewContribution } from '@/app/admin/actions';

export function ReviewForm({ id, expectedUpdatedAt, canApprove }: { id: string; expectedUpdatedAt: string; canApprove: boolean }) {
  const [state, action, pending] = useActionState(reviewContribution, { success: false, message: '' });
  return (
    <form action={action} className="mt-5 border-t border-slate-200 pt-5">
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="expectedUpdatedAt" value={expectedUpdatedAt} />
      <fieldset disabled={pending || state.success} className="space-y-3 disabled:opacity-60">
        <div className="flex flex-wrap gap-3">
          <button name="decision" value="approved" disabled={!canApprove} className="min-h-11 rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-50">{pending ? 'Zapisywanie…' : 'Zatwierdź'}</button>
          <button name="decision" value="rejected" className="min-h-11 rounded-xl border border-rose-200 px-4 py-2 text-sm font-semibold text-rose-700 hover:bg-rose-50">Odrzuć</button>
        </div>
      </fieldset>
      {state.message ? <p role={state.success ? 'status' : 'alert'} className={`mt-3 text-sm ${state.success ? 'text-emerald-800' : 'text-rose-700'}`}>{state.message}</p> : null}
    </form>
  );
}

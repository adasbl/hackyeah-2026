'use server';

import { revalidatePath, revalidateTag } from 'next/cache';
import { redirect } from 'next/navigation';
import { adminLoginSchema, reviewContributionSchema, type AdminActionState } from '@/lib/admin';
import { createAuthClient } from '@/lib/supabase/server';
import { getSupabaseConfig } from '@/lib/supabase/config';
import { requireAdmin } from '@/lib/supabase/admin';
import { isAdmin } from '@/server/admin-access';
import { createModerationService } from '@/server/moderation';
import { PLACES_CACHE_TAG } from '@/lib/data/places';

export async function login(_state: AdminActionState, formData: FormData): Promise<AdminActionState> {
  const input = adminLoginSchema.safeParse({ email: String(formData.get('email') ?? '').trim(), password: formData.get('password') });
  if (!input.success) return { success: false, message: 'Podaj poprawny adres e-mail i hasło.' };
  if (!getSupabaseConfig()) return { success: false, message: 'Logowanie nie jest jeszcze dostępne.' };
  try {
    const client = await createAuthClient();
    const { data, error } = await client.auth.signInWithPassword(input.data);
    if (error || !data.user) return { success: false, message: 'Nie udało się zalogować. Sprawdź dane i spróbuj ponownie.' };
    try {
      const { db } = await import('@/db/client');
      if (!await isAdmin(db, data.user.id)) {
        await client.auth.signOut({ scope: 'local' });
        return { success: false, message: 'To konto nie ma dostępu do panelu administratora.' };
      }
    } catch {
      await client.auth.signOut({ scope: 'local' });
      return { success: false, message: 'Nie udało się sprawdzić uprawnień. Spróbuj ponownie później.' };
    }
  } catch {
    return { success: false, message: 'Logowanie jest chwilowo niedostępne. Spróbuj ponownie później.' };
  }
  redirect('/admin');
}

export async function logout() {
  const client = await createAuthClient();
  await client.auth.signOut({ scope: 'local' });
  redirect('/admin/login');
}

export async function reviewContribution(_state: AdminActionState, formData: FormData): Promise<AdminActionState> {
  const admin = await requireAdmin();
  const input = reviewContributionSchema.safeParse({
    id: formData.get('id'), decision: formData.get('decision'),
    expectedUpdatedAt: formData.get('expectedUpdatedAt'), note: formData.get('note') ?? '',
  });
  if (!input.success) return { success: false, message: 'Niepoprawna decyzja lub zbyt długa notatka (maksymalnie 1000 znaków).' };
  let result: Awaited<ReturnType<ReturnType<typeof createModerationService>['review']>>;
  try {
    const { db } = await import('@/db/client');
    result = await createModerationService(db).review(admin.id, input.data);
  } catch {
    return { success: false, message: 'Nie udało się zapisać decyzji. Sprawdź uprawnienia i spróbuj ponownie.' };
  }
  revalidatePath('/admin');
  if (result === 'approved') revalidateTag(PLACES_CACHE_TAG);
  const messages = {
    approved: 'Zgłoszenie zatwierdzone. Dane publiczne zostały zaktualizowane.',
    rejected: 'Zgłoszenie odrzucone. Dane publiczne pozostają bez zmian.',
    already_reviewed: 'To zgłoszenie zostało już rozpatrzone. Odśwież listę.',
    unpublished: 'Obiekt nie jest już opublikowany. Zgłoszenie można odrzucić.',
    conflict: 'Dane obiektu zmieniły się. Odśwież listę i porównaj je ponownie przed zatwierdzeniem.',
  };
  return { success: result === 'approved' || result === 'rejected', message: messages[result] };
}

'use server';

import { revalidateTag } from 'next/cache';
import { cardContributionSchema, type CardContributionState } from '@/lib/card-contribution';
import { PLACES_CACHE_TAG } from '@/lib/data/places';
import { createCardContributionsService } from '@/server/card-contributions';

export async function saveCardContribution(
  _previous: CardContributionState,
  formData: FormData,
): Promise<CardContributionState> {
  const parsed = cardContributionSchema.safeParse({
    placeSlug: formData.get('placeSlug'),
    provider: formData.get('provider'),
    status: formData.get('status'),
    conditions: formData.get('conditions') ?? '',
    sourceUrl: formData.get('sourceUrl') ?? '',
  });
  if (!parsed.success) {
    const errors: NonNullable<CardContributionState['errors']> = {};
    for (const issue of parsed.error.issues) {
      const field = issue.path[0] as keyof typeof errors;
      errors[field] ??= issue.message;
    }
    return { success: false, message: 'Sprawdź dane w formularzu.', errors };
  }

  try {
    const { db } = await import('@/db/client');
    const saved = await createCardContributionsService(db).save(parsed.data);
    if (!saved) return { success: false, message: 'Ten obiekt nie jest już dostępny.' };
  } catch {
    return { success: false, message: 'Nie udało się zapisać informacji. Spróbuj ponownie za chwilę.' };
  }

  revalidateTag(PLACES_CACHE_TAG);
  return { success: true, message: 'Dziękujemy! Informacja o karcie została zapisana jako zgłoszenie społeczności.' };
}

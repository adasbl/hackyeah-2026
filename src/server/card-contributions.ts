import { and, eq } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import * as schema from '@/db/schema';
import { CARD_PROVIDERS } from '@/lib/catalog';
import { cardContributionSchema, type CardContribution } from '@/lib/card-contribution';

type Database = Pick<PostgresJsDatabase<typeof schema>, 'transaction'>;
const { places, cardProviders, placeCardClaims } = schema;

export function createCardContributionsService(database: Database) {
  async function save(input: CardContribution): Promise<boolean> {
    const contribution = cardContributionSchema.parse(input);
    return database.transaction(async (tx) => {
      const now = new Date();
      // Blokada wiersza i zapis są w jednej transakcji; szkiców nie można edytować.
      const [place] = await tx.update(places).set({ updatedAt: now })
        .where(and(eq(places.slug, contribution.placeSlug), eq(places.isPublished, true)))
        .returning({ id: places.id });
      if (!place) return false;

      const providerName = CARD_PROVIDERS.find((provider) => provider.slug === contribution.provider)!.name;
      await tx.insert(cardProviders).values({ slug: contribution.provider, name: providerName })
        .onConflictDoNothing({ target: cardProviders.slug });
      const [provider] = await tx.select({ id: cardProviders.id }).from(cardProviders)
        .where(eq(cardProviders.slug, contribution.provider)).limit(1);

      const claim = {
        status: contribution.status,
        conditions: contribution.conditions || null,
        sourceType: 'community' as const,
        sourceUrl: contribution.sourceUrl || null,
        sourceQuote: null,
        confidence: 'low' as const,
        verifiedAt: now,
        expiresAt: null,
        updatedAt: now,
      };
      await tx.insert(placeCardClaims).values({ placeId: place.id, providerId: provider.id, ...claim })
        .onConflictDoUpdate({
          target: [placeCardClaims.placeId, placeCardClaims.providerId],
          set: claim,
        });
      return true;
    });
  }

  return { save };
}

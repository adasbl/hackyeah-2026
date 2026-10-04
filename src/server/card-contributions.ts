import { and, eq } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import * as schema from '@/db/schema';
import { cardContributionSchema, type CardContribution } from '@/lib/card-contribution';

type Database = Pick<PostgresJsDatabase<typeof schema>, 'transaction'>;
const { places, cardContributions } = schema;

export function createCardContributionsService(database: Database) {
  async function save(input: CardContribution): Promise<boolean> {
    const contribution = cardContributionSchema.parse(input);
    return database.transaction(async (tx) => {
      // Blokada chroni przed wycofaniem publikacji w trakcie zgłoszenia, bez zmiany obiektu.
      const [place] = await tx.select({ id: places.id }).from(places)
        .where(and(eq(places.slug, contribution.placeSlug), eq(places.isPublished, true)))
        .limit(1).for('share');
      if (!place) return false;

      await tx.insert(cardContributions).values({
        placeId: place.id,
        provider: contribution.provider,
        status: contribution.status,
        conditions: contribution.conditions || null,
        sourceUrl: contribution.sourceUrl || null,
      });
      return true;
    });
  }

  return { save };
}

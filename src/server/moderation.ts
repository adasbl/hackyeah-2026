import { and, asc, desc, eq } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import * as schema from '@/db/schema';
import { CARD_PROVIDERS } from '@/lib/catalog';
import { reviewContributionSchema, type ReviewContribution, type ReviewStatus } from '@/lib/admin';
import { isAdmin } from './admin-access';

type Database = Pick<PostgresJsDatabase<typeof schema>, 'select' | 'transaction'>;
const { adminUsers, places, cardContributions, cardProviders, placeCardClaims } = schema;
export const MODERATION_PAGE_SIZE = 20;

export function createModerationService(database: Database) {
  async function list(userId: string, status: ReviewStatus, page = 1) {
    if (!await isAdmin(database, userId)) throw new Error('ADMIN_REQUIRED');
    const rows = await database.select({
      contribution: cardContributions,
      place: { name: places.name, slug: places.slug, city: places.city, isPublished: places.isPublished, updatedAt: places.updatedAt },
      currentClaim: { status: placeCardClaims.status, conditions: placeCardClaims.conditions, sourceUrl: placeCardClaims.sourceUrl },
    }).from(cardContributions)
      .innerJoin(places, eq(places.id, cardContributions.placeId))
      .leftJoin(cardProviders, eq(cardProviders.slug, cardContributions.provider))
      .leftJoin(placeCardClaims, and(eq(placeCardClaims.placeId, places.id), eq(placeCardClaims.providerId, cardProviders.id)))
      .where(eq(cardContributions.reviewStatus, status))
      .orderBy(status === 'pending' ? asc(cardContributions.createdAt) : desc(cardContributions.reviewedAt), asc(cardContributions.id))
      .limit(MODERATION_PAGE_SIZE + 1).offset((page - 1) * MODERATION_PAGE_SIZE);
    return { items: rows.slice(0, MODERATION_PAGE_SIZE), hasMore: rows.length > MODERATION_PAGE_SIZE };
  }

  async function review(userId: string, input: ReviewContribution) {
    const review = reviewContributionSchema.parse(input);
    return database.transaction(async (tx) => {
      // Uprawnienia sprawdzamy ponownie w transakcji, także przy bezpośrednim wywołaniu akcji.
      const [admin] = await tx.select({ id: adminUsers.userId }).from(adminUsers)
        .where(and(eq(adminUsers.userId, userId), eq(adminUsers.isActive, true))).limit(1).for('share');
      if (!admin) throw new Error('ADMIN_REQUIRED');
      const [entry] = await tx.select().from(cardContributions)
        .where(eq(cardContributions.id, review.id)).limit(1).for('update');
      if (!entry || entry.reviewStatus !== 'pending') return 'already_reviewed' as const;

      const [place] = await tx.select().from(places).where(eq(places.id, entry.placeId)).limit(1).for('update');
      if (review.decision === 'approved' && (!place?.isPublished)) return 'unpublished' as const;
      if (review.decision === 'approved' && place.updatedAt.toISOString() !== review.expectedUpdatedAt) return 'conflict' as const;
      const [previousClaim] = await tx.select({
        status: placeCardClaims.status, conditions: placeCardClaims.conditions, sourceUrl: placeCardClaims.sourceUrl,
      }).from(placeCardClaims).innerJoin(cardProviders, eq(cardProviders.id, placeCardClaims.providerId))
        .where(and(eq(placeCardClaims.placeId, entry.placeId), eq(cardProviders.slug, entry.provider))).limit(1);

      const now = new Date();
      if (review.decision === 'approved') {
        const provider = CARD_PROVIDERS.find(({ slug }) => slug === entry.provider);
        if (!provider) throw new Error('INVALID_PROVIDER');
        await tx.insert(cardProviders).values(provider).onConflictDoNothing({ target: cardProviders.slug });
        const [savedProvider] = await tx.select({ id: cardProviders.id }).from(cardProviders)
          .where(eq(cardProviders.slug, entry.provider)).limit(1);
        const claim = {
          status: entry.status, conditions: entry.conditions, sourceUrl: entry.sourceUrl,
          sourceType: 'community' as const, sourceQuote: null, confidence: 'medium' as const,
          verifiedAt: now, expiresAt: null, updatedAt: now,
        };
        await tx.insert(placeCardClaims).values({ placeId: entry.placeId, providerId: savedProvider.id, ...claim })
          .onConflictDoUpdate({ target: [placeCardClaims.placeId, placeCardClaims.providerId], set: claim });
        await tx.update(places).set({ updatedAt: now }).where(eq(places.id, entry.placeId));
      }
      await tx.update(cardContributions).set({
        reviewStatus: review.decision, reviewedAt: now, reviewedBy: userId,
        reviewNote: review.note || null, previousClaim: previousClaim ?? null,
      }).where(eq(cardContributions.id, entry.id));
      return review.decision;
    });
  }

  return { list, review };
}

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { drizzle } from 'drizzle-orm/postgres-js';
import * as schema from '../../src/db/schema';
import { reviewContributionSchema } from '../../src/lib/admin';
import { createModerationService } from '../../src/server/moderation';

const review = { id: 'ab6bc62e-5201-41f4-9a61-cf586f5de113', decision: 'approved' as const, expectedUpdatedAt: '2026-10-04T10:00:00.000Z' };

test('moderacja odrzuca niepoprawne decyzje, identyfikatory i daty zatwierdzenia', () => {
  for (const invalid of [{ decision: 'pending' }, { id: 'anything' }, { expectedUpdatedAt: '' }]) {
    assert.equal(reviewContributionSchema.safeParse({ ...review, ...invalid }).success, false);
  }
});

test('odrzucenie wymaga tylko identyfikatora zgłoszenia', () => {
  assert.equal(reviewContributionSchema.safeParse({ id: review.id, decision: 'rejected', expectedUpdatedAt: null }).success, true);
});

test('konto bez aktywnych uprawnień nie odczyta kolejki i nie zapisze decyzji', async () => {
  const database = drizzle.mock({ schema });
  const queries: string[] = [];
  const select = database.select.bind(database);
  database.select = ((fields: Parameters<typeof select>[0]) => {
    const builder = select(fields);
    const from = builder.from.bind(builder);
    builder.from = ((table: Parameters<typeof from>[0]) => {
      const query = from(table);
      query.execute = (async () => { queries.push(query.toSQL().sql); return []; }) as typeof query.execute;
      return query;
    }) as typeof builder.from;
    return builder;
  }) as typeof database.select;
  database.transaction = async (callback) => callback(database as unknown as Parameters<Parameters<typeof database.transaction>[0]>[0]);
  const service = createModerationService(database);
  await assert.rejects(service.list(review.id, 'pending'), /ADMIN_REQUIRED/);
  await assert.rejects(service.review(review.id, review), /ADMIN_REQUIRED/);
  assert.equal(queries.length, 2);
  assert.ok(queries.every((sql) => sql.includes('"admin_users"') && sql.includes('"is_active"')));
  assert.match(queries[1], /for share/);
});

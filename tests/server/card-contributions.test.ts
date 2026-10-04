import assert from 'node:assert/strict';
import { test } from 'node:test';
import { drizzle } from 'drizzle-orm/postgres-js';
import * as schema from '../../src/db/schema';
import { cardContributionSchema } from '../../src/lib/card-contribution';
import { createCardContributionsService } from '../../src/server/card-contributions';

const input = {
  placeSlug: 'basen-test', provider: 'multisport' as const,
  status: 'accepted' as const, conditions: '', sourceUrl: '',
};

test('zgłoszenie wymaga znanej karty, statusu i warunków dla akceptacji warunkowej', () => {
  for (const invalid of [
    { provider: 'visa' }, { status: 'unknown' }, { status: 'conditional' },
    { status: 'conditional', conditions: '   ' }, { placeSlug: '../basen-test' },
    { conditions: 'x'.repeat(1001) }, { sourceUrl: 'https://example.org/' + 'x'.repeat(2000) },
  ]) {
    assert.equal(cardContributionSchema.safeParse({ ...input, ...invalid }).success, false);
  }
  const parsed = cardContributionSchema.parse({ ...input, status: 'conditional', conditions: '  Dopłata 10 zł  ' });
  assert.equal(parsed.conditions, 'Dopłata 10 zł');
});

test('link do źródła dopuszcza tylko HTTP(S) bez danych logowania', () => {
  for (const sourceUrl of ['javascript:alert(1)', 'data:text/html,test', 'ftp://example.org', 'example.org', 'https://user:password@example.org']) {
    assert.equal(cardContributionSchema.safeParse({ ...input, sourceUrl }).success, false);
  }
  for (const sourceUrl of ['', 'https://example.org/karty', 'http://example.org/karty']) {
    assert.equal(cardContributionSchema.safeParse({ ...input, sourceUrl }).success, true);
  }
});

// Budujemy rzeczywiste zapytania Drizzle, podmieniając jedynie ich wykonanie.
function harness(published = true, failWrite = false) {
  const database = drizzle.mock({ schema });
  const queries: { sql: string; params: unknown[] }[] = [];
  let transactions = 0;
  database.transaction = async (callback) => {
    transactions++;
    return callback(database as unknown as Parameters<Parameters<typeof database.transaction>[0]>[0]);
  };
  const update = database.update.bind(database);
  database.update = ((table: Parameters<typeof update>[0]) => {
    const builder = update(table);
    const set = builder.set.bind(builder);
    builder.set = ((values: Parameters<typeof set>[0]) => {
      const query = set(values);
      query.execute = (async () => {
        queries.push(query.toSQL());
        return published ? [{ id: 'place-id' }] : [];
      }) as typeof query.execute;
      return query;
    }) as typeof builder.set;
    return builder;
  }) as typeof database.update;
  const insert = database.insert.bind(database);
  database.insert = ((table: Parameters<typeof insert>[0]) => {
    const builder = insert(table);
    const values = builder.values.bind(builder);
    builder.values = ((row: Parameters<typeof values>[0]) => {
      const query = values(row);
      query.execute = (async () => {
        queries.push(query.toSQL());
        if (failWrite && table === schema.cardContributions) throw new Error('WRITE_FAILED');
        return [];
      }) as typeof query.execute;
      return query;
    }) as typeof builder.values;
    return builder;
  }) as typeof database.insert;
  const select = database.select.bind(database);
  database.select = ((fields: Parameters<typeof select>[0]) => {
    const builder = select(fields);
    const from = builder.from.bind(builder);
    builder.from = ((table: Parameters<typeof from>[0]) => {
      const query = from(table);
      query.execute = (async () => {
        queries.push(query.toSQL());
        return published ? [{ id: 'place-id' }] : [];
      }) as typeof query.execute;
      return query;
    }) as typeof builder.from;
    return builder;
  }) as typeof database.select;
  return { service: createCardContributionsService(database), queries, transactions: () => transactions };
}

test('zgłoszenie zapisuje wyłącznie propozycję, nie zmienia opublikowanych danych', async () => {
  const { service, queries, transactions } = harness();
  assert.equal(await service.save(input), true);
  assert.equal(transactions(), 1);
  assert.equal(queries.length, 2);
  assert.match(queries[0].sql, /"slug" = \$\d+ and "places"\."is_published" = \$\d+/);
  assert.ok(queries[0].params.includes(true));
  assert.match(queries[0].sql, /for share/);
  const write = queries[1];
  assert.match(write.sql, /^insert into "card_contributions"/);
  assert.ok(write.params.includes('multisport'));
  assert.ok(write.params.includes('place-id'));
  assert.ok(write.params.includes('accepted'));
  assert.ok(queries.every(({ sql }) => !/^update|place_card_claims|card_providers/.test(sql)));
});

test('brak opublikowanego obiektu kończy zapis przed zapytaniami o karty', async () => {
  const { service, queries } = harness(false);
  assert.equal(await service.save(input), false);
  assert.equal(queries.length, 1);
});

test('błąd zapisu przerywa transakcję, a niepoprawne dane nie uruchamiają transakcji', async () => {
  const { service, transactions } = harness(true, true);
  await assert.rejects(service.save(input), /WRITE_FAILED/);
  assert.equal(transactions(), 1);
  await assert.rejects(service.save({ ...input, sourceUrl: 'javascript:alert(1)' }));
  assert.equal(transactions(), 1);
});

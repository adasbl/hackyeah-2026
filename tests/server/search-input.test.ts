import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildSearchUrl, parseSearchParams, resolveSearchInput } from '../../src/lib/search-params';

const cities = [
  { slug: 'polska', name: 'Cała Polska' },
  { slug: 'lodz', name: 'Łódź' },
  { slug: 'warszawa', name: 'Warszawa' },
];

test('wybrana i dokładnie wpisana miejscowość zawęża wyszukiwanie', () => {
  assert.deepEqual(resolveSearchInput({ slug: 'lodz', text: 'Łódź' }, cities), { city: 'lodz' });
  assert.deepEqual(resolveSearchInput({ slug: null, text: '  LODZ ' }, cities), { city: 'lodz' });
  assert.deepEqual(resolveSearchInput({ slug: null, text: 'Warszawa' }, cities), { city: 'warszawa' });
});

test('kod, nazwa, brand i miejscowość spoza listy trafiają do frazy zamiast ścieżki miasta', () => {
  for (const q of ['00-001', '00001', '00 001', 'Pływalnia Łąkowa', 'Zdrofit', 'Nowa Wieś', 'Warsz']) {
    const target = resolveSearchInput({ slug: null, text: ` ${q} ` }, cities);
    assert.deepEqual(target, { city: 'polska', q });
    const url = new URL(buildSearchUrl(target.city, { q: target.q, category: 'basen', cards: ['multisport'] }), 'https://example.test');
    assert.equal(url.pathname, '/polska');
    assert.deepEqual(parseSearchParams(Object.fromEntries(url.searchParams)), {
      q, category: 'basen', cards: ['multisport'], open: false, sort: 'name', view: 'list', page: 1,
    });
  }
});

test('wyczyszczenie wpisu i wybranie całej Polski usuwa poprzednią frazę', () => {
  for (const value of [{ slug: null, text: '   ' }, { slug: 'polska', text: 'Cała Polska' }]) {
    const target = resolveSearchInput(value, cities);
    assert.equal(buildSearchUrl(target.city, { q: target.q }), '/polska');
  }
});

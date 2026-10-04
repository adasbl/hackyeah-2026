import test from 'node:test';
import assert from 'node:assert/strict';
import { getOpenStatus } from '@/lib/opening-hours';

test('brak godzin nie jest wyświetlany jako zamknięte', () => {
  assert.equal(getOpenStatus([]), null);
});

test('jawnie zamknięty harmonogram nadal zwraca status zamknięcia', () => {
  assert.deepEqual(getOpenStatus([{ days: 'pon–niedz', hours: 'zamknięte' }]), {
    open: false,
    label: 'Zamknięte',
  });
});

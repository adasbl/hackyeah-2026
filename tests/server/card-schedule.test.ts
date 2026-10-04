import assert from 'node:assert/strict';
import test from 'node:test';
import { scanByHost } from '../../src/server/card-crawler/schedule';
import { isAccessChallenge } from '../../src/server/card-crawler/http';

test('host aliases stay serial while independent hosts overlap', async () => {
  const active = new Set<string>();
  let peak = 0;
  const visited: number[] = [];
  const rows = ['https://a.example', 'http://www.a.example/path', 'https://b.example', 'https://c.example']
    .map((website, id) => ({ website, id }));
  await scanByHost(rows, 2, async (row) => {
    const host = new URL(row.website).hostname.replace(/^www\./, '');
    assert.equal(active.has(host), false);
    active.add(host); peak = Math.max(peak, active.size);
    await new Promise((resolve) => setTimeout(resolve, 5));
    visited.push(row.id); active.delete(host);
  });
  assert.equal(peak, 2);
  assert.deepEqual([...visited].sort(), [0, 1, 2, 3]);
  assert.ok(visited.indexOf(0) < visited.indexOf(1));
});

test('cancellation stops queued work', async () => {
  const controller = new AbortController();
  let count = 0;
  await scanByHost([{ website: null }, { website: null }], 2, async () => {
    count++; controller.abort();
  }, controller.signal);
  assert.equal(count, 1);
});

test('scheduler waits for active hosts before propagating errors', async () => {
  let finished = false;
  await assert.rejects(scanByHost([{ website: 'https://a.example' }, { website: 'https://b.example' }], 2, async (row) => {
    if (row.website.includes('a.example')) throw new Error('FAILED');
    await new Promise((resolve) => setTimeout(resolve, 10));
    finished = true;
  }), /FAILED/);
  assert.equal(finished, true);
});

test('JavaScript robot interstitial is an access challenge', () => {
  assert.equal(isAccessChallenge({ status: 200, headers: {}, body: Buffer.from("<body><h1>JavaScript is disabled</h1>In order to continue, we need to verify that you're not a robot. This requires JavaScript.</body>") }), true);
});

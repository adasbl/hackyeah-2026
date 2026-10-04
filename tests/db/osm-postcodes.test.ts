import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { deflateSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { createPostcodeLookup, normalizePolishPostcode, planPostcodeUpdates, postcodeArea,
  type PostcodeArea, type PostcodeAddress, type PostcodeInput } from '../../src/db/osm-postcodes';
import { preparePolandPostcodes } from '../../src/db/osm-postcodes-pbf';
import { normalizePolandPlace } from '../../src/db/osm-poland';

const row: PostcodeInput = { id: '1', slug: 'osm-node-1', osmType: 'node', osmId: 1, postalCode: null,
  city: 'Łódź', addressStreet: 'Testowa', addressHouseNumber: '1', osmTags: {}, location: { x: 19.401, y: 51.701 } };
const area = (postcode = '90-001', kind: PostcodeArea['kind'] = 'address_area'): PostcodeArea => ({
  postcode, kind, geometry: { osmType: 'way', osmId: 20, name: postcode, citySlug: postcode,
    bounds: [19.4, 51.7, 19.402, 51.702], inner: [], outer: [[
      { x: 19.4, y: 51.7 }, { x: 19.402, y: 51.7 }, { x: 19.402, y: 51.702 },
      { x: 19.4, y: 51.702 }, { x: 19.4, y: 51.7 },
    ]] } });
const address = (postcode = '90-001'): PostcodeAddress => ({ osmType: 'node', osmId: 5, postcode,
  location: row.location, street: 'Testowa', houseNumber: '1', city: 'Łódź' });

test('polski format kodu: spacje i pięć cyfr, bez zgadywania list lub zakresów', () => {
  assert.equal(normalizePolishPostcode(' 00123 '), '00-123');
  assert.equal(normalizePolishPostcode('90-001'), '90-001');
  for (const value of ['90-001;90-002', '90-001–90-100', '90 001', 'PL-90001', '1234', '', null]) assert.equal(normalizePolishPostcode(value), null);
  assert.equal(normalizePolandPlace({ type: 'node', id: 1, tags: { 'addr:postcode': ' 90001 ' } }, row.location, 'fitness').postalCode, '90-001');
});

test('obszary: budynki i jawne granice kodów; bez urzędu pocztowego, ulic i obcych adresów', () => {
  assert.deepEqual(postcodeArea({ type: 'way', id: 1, refs: [1, 2, 3, 1], tags: { building: 'yes', 'addr:postcode': '90001' } }), { kind: 'address_area', postcode: '90-001' });
  assert.equal(postcodeArea({ type: 'way', id: 1, refs: [1, 2], tags: { highway: 'residential', postal_code: '90-001' } }), null);
  assert.equal(postcodeArea({ type: 'node', id: 1, tags: { amenity: 'post_office', postal_code: '90-001' } }), null);
  assert.equal(postcodeArea({ type: 'relation', id: 1, tags: { boundary: 'administrative', postal_code: '90-001;90-002' } }), null);
  assert.deepEqual(postcodeArea({ type: 'relation', id: 1, tags: { boundary: 'postal_code', postal_code: '90-001' } }), { kind: 'postal_boundary', postcode: '90-001' });
  assert.equal(postcodeArea({ type: 'way', id: 1, refs: [1, 2, 3, 1], tags: { building: 'yes', 'addr:postcode': '90001', 'addr:country': 'DE' } }), null);
});

test('dopasowanie adresu wymaga ulicy, numeru, zgodnego miasta i odległości; nie wybiera najbliższego adresu', () => {
  const lookup = createPostcodeLookup([], [address()]);
  assert.equal(lookup(row).reason, 'matched');
  assert.equal(lookup({ ...row, addressHouseNumber: '2' }).reason, 'no_matching_source');
  assert.equal(createPostcodeLookup([], [{ ...address(), houseNumber: '1/2' }])({ ...row, addressHouseNumber: '1-2' }).reason, 'no_matching_source');
  assert.equal(lookup({ ...row, addressStreet: null }).reason, 'no_matching_source');
  assert.equal(lookup({ ...row, city: 'Warszawa' }).reason, 'no_matching_source');
  assert.equal(lookup({ ...row, location: { x: 19.5, y: 51.7 } }).reason, 'no_matching_source');
  assert.equal(lookup({ ...row, osmTags: { 'addr:country': 'DE', 'addr:postcode': '12345' } }).reason, 'unsupported_country');
});

test('poligony i sprzeczności: zgodne źródła, krawędzie i ochrona bezpośredniego tagu obiektu', () => {
  assert.equal(createPostcodeLookup([area()], [])(row).reason, 'matched');
  assert.equal(createPostcodeLookup([area(), area('90-002', 'postal_boundary')], [])(row).reason, 'conflicting_postcodes');
  assert.equal(createPostcodeLookup([area()], [address('90-002')])(row).reason, 'conflicting_postcodes');
  assert.equal(createPostcodeLookup([area()], [])({ ...row, location: { x: 19.4, y: 51.701 } }).reason, 'on_boundary');
  const own = createPostcodeLookup([area()], [])({ ...row, osmTags: { 'addr:postcode': '90003' } });
  assert.equal(own.reason, 'matched'); assert.equal(own.postcode, '90-003');
});

test('plan chroni istniejące kody, wykrywa zmianę współrzędnych i jest idempotentny', () => {
  const cache = { targets: [{ slug: row.slug, location: row.location }], areas: [area()], addresses: [] };
  const plan = planPostcodeUpdates([row,
    { ...row, id: '2', postalCode: '00-001' }, { ...row, id: '3', postalCode: 'ręczna wartość' },
    { ...row, id: '4', location: { x: 19.4011, y: 51.701 } },
  ], cache);
  assert.equal(plan.updates.length, 1); assert.equal(plan.invalidExisting, 1);
  assert.deepEqual(plan.skipped, { already_present: 2, cache_target_missing_or_moved: 1 });
  assert.equal(planPostcodeUpdates([{ ...row, postalCode: plan.updates[0].postalCode }], cache).updates.length, 0);
});

function fixture() {
  const vi = (value: number): Buffer => { const bytes = []; do { const byte = value % 128; value = Math.floor(value / 128); bytes.push(byte + (value ? 128 : 0)); } while (value); return Buffer.from(bytes); };
  const zz = (n: number) => vi(n < 0 ? -n * 2 - 1 : n * 2);
  const numeric = (tag: number, value: number) => Buffer.concat([vi(tag * 8), vi(value)]);
  const field = (tag: number, value: Buffer) => Buffer.concat([vi(tag * 8 + 2), vi(value.length), value]);
  const signed = (tag: number, value: number) => Buffer.concat([vi(tag * 8), zz(value)]);
  const packed = (tag: number, values: number[], signedValues = false) => field(tag, Buffer.concat(values.map(signedValues ? zz : vi)));
  const strings = [''];
  const index = (s: string) => { if (!strings.includes(s)) strings.push(s); return strings.indexOf(s); };
  const tags = (value: Record<string, string>) => Buffer.concat([packed(2, Object.keys(value).map(index)), packed(3, Object.values(value).map(index))]);
  const node = (id: number, x: number, y: number, value: Record<string, string> = {}) => field(1, Buffer.concat([
    signed(1, id), tags(value), signed(8, Math.round(y * 1e7)), signed(9, Math.round(x * 1e7)),
  ]));
  const way = (id: number, refs: number[], value: Record<string, string> = {}) => field(3, Buffer.concat([
    numeric(1, id), tags(value), packed(8, refs.map((ref, i) => ref - (refs[i - 1] ?? 0)), true),
  ]));
  const relation = field(4, Buffer.concat([numeric(1, 30), tags({ type: 'boundary', boundary: 'postal_code', postal_code: '90-001' }),
    packed(8, [index('outer'), index('label')]), packed(9, [20, 979], true), packed(10, [1, 0])]));
  // Celowo nieuporządkowane ID: sprawdzamy też wyszukiwanie poza szybkim przebiegiem po ID.
  const nodes = Buffer.concat([node(3, 19.402, 51.702), node(1, 19.4, 51.7), node(2, 19.402, 51.7), node(4, 19.4, 51.702),
    node(5, 19.401, 51.701, { 'addr:postcode': '90001', 'addr:street': 'Testowa', 'addr:housenumber': '1', 'addr:city': 'Łódź' }),
    node(6, 20, 52, { 'addr:postcode': '90001', 'addr:street': 'Testowa', 'addr:housenumber': '1' }),
    node(11, 20, 52), node(12, 20.002, 52), node(13, 20.002, 52.002), node(14, 20, 52.002)]);
  const ways = Buffer.concat([way(20, [1, 2, 3, 4, 1], { building: 'yes', 'addr:postcode': '90-001' }),
    way(21, [11, 12, 13, 14, 11], { building: 'yes', 'addr:postcode': '90-002' }),
    way(22, [1, 999, 3, 1], { building: 'yes', 'addr:postcode': '90-003' })]);
  const block = (type: string, bytes: Buffer) => {
    const blob = Buffer.concat([numeric(2, bytes.length), field(3, deflateSync(bytes))]);
    const header = Buffer.concat([field(1, Buffer.from(type)), numeric(3, blob.length)]);
    const length = Buffer.alloc(4); length.writeUInt32BE(header.length); return Buffer.concat([length, header, blob]);
  };
  const table = field(1, Buffer.concat(strings.map((s) => field(1, Buffer.from(s)))));
  return Buffer.concat([block('OSMHeader', field(4, Buffer.from('OsmSchema-V0.6'))),
    block('OSMData', Buffer.concat([table, field(2, nodes), field(2, ways), field(2, relation)]))]);
}

test('PBF: obszary adresowe, granice pocztowe, filtrowanie do targetów, hash i CLI cache bez dostępu do bazy', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'osm-postcodes-test-'));
  try {
    const bytes = fixture(), file = join(directory, 'postcodes.osm.pbf'); await writeFile(file, bytes);
    const result = await preparePolandPostcodes(file, [{ slug: row.slug, location: row.location }]);
    assert.equal(result.sourceHash, createHash('sha256').update(bytes).digest('hex'));
    assert.equal(result.areas.length, 2); assert.equal(result.addresses.length, 1); assert.equal(result.rejected.length, 1);
    assert.equal(planPostcodeUpdates([row], result).updates[0].postalCode, '90-001');
    const data = { targets: result.targets, areas: result.areas, addresses: result.addresses };
    const snapshot = { formatVersion: 1, preparedAt: new Date().toISOString(),
      source: { file, bytes: bytes.length, sha256: result.sourceHash },
      attribution: '© OpenStreetMap contributors', license: 'https://www.openstreetmap.org/copyright',
      dataHash: createHash('sha256').update(JSON.stringify(data)).digest('hex'), ...data, summary: result.summary, rejected: result.rejected };
    const cacheDirectory = join(directory, '.local/osm/postcodes');
    const { mkdir } = await import('node:fs/promises'); await mkdir(cacheDirectory, { recursive: true });
    const cacheFile = join(cacheDirectory, 'polska-postcodes.json'); await writeFile(cacheFile, JSON.stringify(snapshot));
    const root = process.cwd(), execute = promisify(execFile);
    const cli = [join(root, 'node_modules/tsx/dist/cli.mjs'), '--tsconfig', join(root, 'tsconfig.json'), join(root, 'src/db/fill-osm-postcodes.ts')];
    const offline = { cwd: directory, env: { ...process.env, DATABASE_MIGRATION_URL: '' } };
    await assert.rejects(execute(process.execPath, [...cli, '--from-cache'], offline),
      (error: unknown) => error instanceof Error && error.message.includes('DATABASE_MIGRATION_URL_MISSING'));
    snapshot.addresses[0].postcode = '90-999'; await writeFile(cacheFile, JSON.stringify(snapshot));
    await assert.rejects(execute(process.execPath, [...cli, '--from-cache'], offline),
      (error: unknown) => error instanceof Error && error.message.includes('OSM_POSTCODES_CACHE_INTEGRITY_ERROR'));
    const truncated = join(directory, 'broken.osm.pbf'); await writeFile(truncated, bytes.subarray(0, -1));
    await assert.rejects(preparePolandPostcodes(truncated, result.targets));
  } finally { await rm(directory, { recursive: true, force: true }); }
});

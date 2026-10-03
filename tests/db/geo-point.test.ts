import assert from "node:assert/strict";
import { test } from "node:test";
import { pgTable } from "drizzle-orm/pg-core";
import { wgs84Point } from "../../src/db/geo-point";

const table = pgTable("point_fixture", { location: wgs84Point("location") });
const point = { x: 18.6143214, y: 54.3555465 };

function ewkb(littleEndian: boolean, srid = 4326): string {
  const bytes = Buffer.alloc(25);
  bytes[0] = littleEndian ? 1 : 0;
  if (littleEndian) {
    bytes.writeUInt32LE(0x20000001, 1);
    bytes.writeUInt32LE(srid, 5);
    bytes.writeDoubleLE(point.x, 9);
    bytes.writeDoubleLE(point.y, 17);
  } else {
    bytes.writeUInt32BE(0x20000001, 1);
    bytes.writeUInt32BE(srid, 5);
    bytes.writeDoubleBE(point.x, 9);
    bytes.writeDoubleBE(point.y, 17);
  }
  return bytes.toString("hex");
}

test("typ SQL wymusza schemat extensions i SRID 4326", () => {
  assert.equal(table.location.getSQLType(), "extensions.geometry(Point,4326)");
});

test("zapis punktu OSM zachowuje longitude/latitude i SRID", () => {
  assert.equal(
    table.location.mapToDriverValue(point),
    "SRID=4326;POINT(18.6143214 54.3555465)",
  );
});

for (const littleEndian of [true, false]) {
  test(`odczyt EWKB (${littleEndian ? "little" : "big"} endian)`, () => {
    assert.deepEqual(table.location.mapFromDriverValue(ewkb(littleEndian)), point);
  });
}

test("odrzuca niepoprawny SRID i uszkodzone EWKB", () => {
  assert.throws(() => table.location.mapFromDriverValue(ewkb(true, 3857)));
  assert.throws(() => table.location.mapFromDriverValue("0101"));
  assert.throws(() => table.location.mapFromDriverValue("g".repeat(50)));
});

test("odrzuca współrzędne spoza WGS84 i wartości nieskończone", () => {
  for (const invalid of [
    { x: 181, y: 50 },
    { x: 18, y: -91 },
    { x: NaN, y: 50 },
    { x: 18, y: Infinity },
  ]) {
    assert.throws(() => table.location.mapToDriverValue(invalid));
  }
});

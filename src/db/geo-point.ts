import { customType } from "drizzle-orm/pg-core";

/** WGS84: x = longitude, y = latitude. */
export interface Wgs84Point {
  x: number;
  y: number;
}

function validatePoint(point: Wgs84Point): Wgs84Point {
  if (
    !Number.isFinite(point.x) ||
    !Number.isFinite(point.y) ||
    Math.abs(point.x) > 180 ||
    Math.abs(point.y) > 90
  ) {
    throw new Error("Nieprawidłowe współrzędne WGS84 (x = lng, y = lat)");
  }
  return point;
}

/** PostGIS zwraca geometry jako hex EWKB, zawierający typ, SRID i punkt. */
function decodePoint(value: string): Wgs84Point {
  if (!/^[0-9a-f]{50}$/i.test(value)) {
    throw new Error("Oczekiwano punktu 2D EWKB z SRID 4326");
  }

  const bytes = Buffer.from(value, "hex");
  if (bytes[0] !== 0 && bytes[0] !== 1) {
    throw new Error("Nieprawidłowa kolejność bajtów EWKB");
  }
  const littleEndian = bytes[0] === 1;
  const type = littleEndian ? bytes.readUInt32LE(1) : bytes.readUInt32BE(1);
  const srid = littleEndian ? bytes.readUInt32LE(5) : bytes.readUInt32BE(5);

  // 0x20000000 oznacza obecność SRID, 1 oznacza punkt 2D.
  if (type !== 0x20000001 || srid !== 4326) {
    throw new Error("Oczekiwano punktu 2D EWKB z SRID 4326");
  }

  return validatePoint({
    x: littleEndian ? bytes.readDoubleLE(9) : bytes.readDoubleBE(9),
    y: littleEndian ? bytes.readDoubleLE(17) : bytes.readDoubleBE(17),
  });
}

/** Jawny typ PostGIS; wbudowany geometry() w Drizzle 0.45 pomija SRID. */
export const wgs84Point = customType<{
  data: Wgs84Point;
  driverData: string;
}>({
  dataType: () => "extensions.geometry(Point,4326)",
  toDriver(point) {
    const { x, y } = validatePoint(point);
    // EWKT ustawia SRID również podczas INSERT/UPDATE przez Drizzle.
    return `SRID=4326;POINT(${x} ${y})`;
  },
  fromDriver: decodePoint,
});

import { describe, expect, it } from 'vitest';
import {
  EARTH_CIRCUMFERENCE,
  latFromMercatorY,
  lngFromMercatorX,
  lngLatToMercator,
  mercatorXFromLng,
  mercatorYFromLat,
  meterInMercatorUnits,
} from './mercator';

describe('mercatorXFromLng', () => {
  it('maps -180..180 to 0..1', () => {
    expect(mercatorXFromLng(-180)).toBe(0);
    expect(mercatorXFromLng(0)).toBe(0.5);
    expect(mercatorXFromLng(180)).toBe(1);
  });
});

describe('mercatorYFromLat', () => {
  it('maps the equator to 0.5 and north to smaller values', () => {
    expect(mercatorYFromLat(0)).toBeCloseTo(0.5, 12);
    expect(mercatorYFromLat(35)).toBeLessThan(0.5);
  });
  it('matches the closed form 0.5 - asinh(tan(lat)) / 2π', () => {
    const lat = 35.681236;
    const expected = 0.5 - Math.asinh(Math.tan((lat * Math.PI) / 180)) / (2 * Math.PI);
    expect(mercatorYFromLat(lat)).toBeCloseTo(expected, 12);
    expect(mercatorYFromLat(lat)).toBeCloseTo(0.393778, 6);
  });
});

describe('lngLatToMercator', () => {
  it('combines x and y', () => {
    const m = lngLatToMercator(139.767125, 35.681236);
    expect(m.x).toBeCloseTo(mercatorXFromLng(139.767125), 15);
    expect(m.y).toBeCloseTo(mercatorYFromLat(35.681236), 15);
  });
});

describe('inverse functions', () => {
  it('lngFromMercatorX round-trips', () => {
    expect(lngFromMercatorX(mercatorXFromLng(139.767125))).toBeCloseTo(139.767125, 10);
  });
  it('latFromMercatorY round-trips', () => {
    expect(latFromMercatorY(mercatorYFromLat(35.681236))).toBeCloseTo(35.681236, 10);
  });
});

describe('meterInMercatorUnits', () => {
  it('equals 1/circumference at the equator', () => {
    expect(meterInMercatorUnits(0)).toBeCloseTo(1 / EARTH_CIRCUMFERENCE, 20);
  });
  it('grows with 1/cos(lat)', () => {
    expect(meterInMercatorUnits(60) / meterInMercatorUnits(0)).toBeCloseTo(2, 10);
  });
});

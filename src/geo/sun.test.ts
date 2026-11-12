import { describe, expect, it } from 'vitest';
import {
  declination,
  eclipticLongitude,
  rightAscension,
  siderealTime,
  solarMeanAnomaly,
  sunDirectionENU,
  sunPosition,
  toDays,
} from './sun';

const DEG = 180 / Math.PI;

describe('toDays', () => {
  it('is zero at J2000 epoch (2000-01-01T12:00Z)', () => {
    expect(toDays(new Date('2000-01-01T12:00:00Z'))).toBeCloseTo(0, 9);
  });
});

describe('solarMeanAnomaly', () => {
  it('is 357.5291° at J2000', () => {
    expect(solarMeanAnomaly(0) * DEG).toBeCloseTo(357.5291, 6);
  });
});

describe('eclipticLongitude', () => {
  it('is about 280.4° (sun near winter solstice) at J2000', () => {
    const L = (eclipticLongitude(solarMeanAnomaly(0)) * DEG) % 360;
    expect(L).toBeGreaterThan(279.5);
    expect(L).toBeLessThan(281.5);
  });
});

describe('declination', () => {
  it('is zero at ecliptic longitude 0 and max at 90°', () => {
    expect(declination(0)).toBeCloseTo(0, 12);
    expect(declination(Math.PI / 2) * DEG).toBeCloseTo(23.4397, 4);
  });
});

describe('rightAscension', () => {
  it('equals ecliptic longitude at 0 and 90°', () => {
    expect(rightAscension(0)).toBeCloseTo(0, 12);
    expect(rightAscension(Math.PI / 2)).toBeCloseTo(Math.PI / 2, 12);
  });
});

describe('siderealTime', () => {
  it('adds the longitude', () => {
    expect(siderealTime(0, 1) - siderealTime(0, 0)).toBeCloseTo(1, 12);
  });
});

describe('sunPosition', () => {
  // Reference values from NOAA solar calculator for Tokyo (35.681N, 139.767E)
  it('summer solstice noon JST: high altitude, due south', () => {
    const p = sunPosition(new Date('2026-06-21T02:43:00Z'), 35.681, 139.767);
    expect(p.altitude * DEG).toBeGreaterThan(77);
    expect(p.altitude * DEG).toBeLessThan(78.5);
    expect(p.azimuth * DEG).toBeGreaterThan(170);
    expect(p.azimuth * DEG).toBeLessThan(190);
  });
  it('winter solstice noon JST: low altitude around 31°', () => {
    const p = sunPosition(new Date('2026-12-22T02:38:00Z'), 35.681, 139.767);
    expect(p.altitude * DEG).toBeGreaterThan(30);
    expect(p.altitude * DEG).toBeLessThan(31.6);
  });
  it('equinox morning: sun in the east', () => {
    const p = sunPosition(new Date('2026-03-20T00:00:00Z'), 35.681, 139.767); // 9:00 JST
    expect(p.azimuth * DEG).toBeGreaterThan(100);
    expect(p.azimuth * DEG).toBeLessThan(140);
    expect(p.altitude).toBeGreaterThan(0);
  });
  it('midnight: below horizon', () => {
    const p = sunPosition(new Date('2026-06-21T15:00:00Z'), 35.681, 139.767);
    expect(p.altitude).toBeLessThan(0);
  });
});

describe('sunDirectionENU', () => {
  it('points up at altitude 90°', () => {
    const [x, y, z] = sunDirectionENU({ azimuth: 0, altitude: Math.PI / 2 });
    expect(x).toBeCloseTo(0, 12);
    expect(y).toBeCloseTo(0, 12);
    expect(z).toBeCloseTo(1, 12);
  });
  it('points east at azimuth 90°, altitude 0', () => {
    const v = sunDirectionENU({ azimuth: Math.PI / 2, altitude: 0 });
    expect(v[0]).toBeCloseTo(1, 12);
    expect(v[1]).toBeCloseTo(0, 12);
  });
  it('is a unit vector', () => {
    const v = sunDirectionENU({ azimuth: 1.1, altitude: 0.4 });
    expect(Math.hypot(...v)).toBeCloseTo(1, 12);
  });
});

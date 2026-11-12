import { describe, expect, it } from 'vitest';
import {
  TOKYO_STATION,
  composeLocalToClip,
  createLocalFrame,
  lngLatToLocal,
  localToLngLat,
  localToMercatorMatrix,
} from './localFrame';
import { identity, projectPoint, scaling, transformVec4 } from './mat4';
import { lngLatToMercator, meterInMercatorUnits } from './mercator';

const frame = createLocalFrame(TOKYO_STATION.lng, TOKYO_STATION.lat);

describe('createLocalFrame', () => {
  it('stores the mercator origin and scale', () => {
    const m = lngLatToMercator(TOKYO_STATION.lng, TOKYO_STATION.lat);
    expect(frame.mercX).toBe(m.x);
    expect(frame.mercY).toBe(m.y);
    expect(frame.scale).toBe(meterInMercatorUnits(TOKYO_STATION.lat));
  });
});

describe('lngLatToLocal', () => {
  it('maps the origin to (0,0)', () => {
    const [x, y] = lngLatToLocal(frame, TOKYO_STATION.lng, TOKYO_STATION.lat);
    expect(x).toBeCloseTo(0, 9);
    expect(y).toBeCloseTo(0, 9);
  });
  it('points north to +y and east to +x with approximately true distances', () => {
    // 0.001 deg latitude ≈ 110.95 m, 0.001 deg longitude ≈ 90.4 m at 35.68N
    const [, yN] = lngLatToLocal(frame, TOKYO_STATION.lng, TOKYO_STATION.lat + 0.001);
    const [xE] = lngLatToLocal(frame, TOKYO_STATION.lng + 0.001, TOKYO_STATION.lat);
    expect(yN).toBeGreaterThan(110.5);
    expect(yN).toBeLessThan(111.5);
    expect(xE).toBeGreaterThan(90);
    expect(xE).toBeLessThan(91);
  });
});

describe('localToLngLat', () => {
  it('round-trips with lngLatToLocal', () => {
    const [x, y] = lngLatToLocal(frame, 139.77, 35.685);
    const [lng, lat] = localToLngLat(frame, x, y);
    expect(lng).toBeCloseTo(139.77, 10);
    expect(lat).toBeCloseTo(35.685, 10);
  });
});

describe('localToMercatorMatrix', () => {
  it('agrees with lngLatToMercator', () => {
    const [x, y] = lngLatToLocal(frame, 139.772, 35.678);
    const p = transformVec4(localToMercatorMatrix(frame), [x, y, 10, 1]);
    const m = lngLatToMercator(139.772, 35.678);
    expect(p[0]).toBeCloseTo(m.x, 14);
    expect(p[1]).toBeCloseTo(m.y, 14);
    expect(p[2]).toBeCloseTo(10 * frame.scale, 18);
  });
});

describe('composeLocalToClip', () => {
  it('applies the mercator->clip matrix after the local->mercator transform', () => {
    const merc2clip = scaling(2, 2, 2);
    const p = projectPoint(composeLocalToClip(merc2clip, frame), [0, 0, 0]);
    expect(p[0]).toBeCloseTo(2 * frame.mercX, 12);
    expect(p[1]).toBeCloseTo(2 * frame.mercY, 12);
  });
  it('with identity equals localToMercatorMatrix', () => {
    expect(Array.from(composeLocalToClip(identity(), frame))).toEqual(
      Array.from(localToMercatorMatrix(frame)),
    );
  });
});

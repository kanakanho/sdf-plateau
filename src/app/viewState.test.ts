import { describe, expect, it } from 'vitest';
import { ColorMode, RenderFlag } from '../render/frame';
import { applyPatch, areaPagePath, canvasSize, formatMinutes, initialViewState, isAnimated, jstDate, renderFlags, sunIntensity, sunLighting } from './viewState';

describe('renderFlags', () => {
  it('combines toggles into bit flags', () => {
    expect(renderFlags({ shadows: true, ao: false, refine: true, groundShadows: false })).toBe(RenderFlag.Shadows | RenderFlag.Refine);
    expect(renderFlags(initialViewState)).toBe(RenderFlag.Shadows | RenderFlag.Ao | RenderFlag.Ground);
  });
});

describe('jstDate', () => {
  it('converts JST wall time to a UTC instant', () => {
    expect(jstDate('2026-06-21', 12 * 60).toISOString()).toBe('2026-06-21T03:00:00.000Z');
    expect(jstDate('2026-01-01', 30).toISOString()).toBe('2025-12-31T15:30:00.000Z');
  });
});

describe('formatMinutes', () => {
  it('formats hh:mm', () => {
    expect(formatMinutes(0)).toBe('00:00');
    expect(formatMinutes(14 * 60 + 5)).toBe('14:05');
  });
});

describe('sunIntensity', () => {
  it('is 0 well below the horizon and 1 when high', () => {
    expect(sunIntensity({ azimuth: 0, altitude: -0.2 })).toBe(0);
    expect(sunIntensity({ azimuth: 0, altitude: 0.5 })).toBe(1);
    const mid = sunIntensity({ azimuth: 0, altitude: 0.03 });
    expect(mid).toBeGreaterThan(0);
    expect(mid).toBeLessThan(1);
  });
});

describe('sunLighting', () => {
  it('gives a sun from the south at noon and darkness at midnight', () => {
    const noon = sunLighting({ date: '2026-06-21', minutes: 11 * 60 + 43 }, 35.68, 139.77);
    expect(noon.dir[1]).toBeLessThan(0); // south
    expect(noon.dir[2]).toBeGreaterThan(0.9);
    expect(noon.intensity).toBe(1);
    expect(sunLighting({ date: '2026-06-21', minutes: 0 }, 35.68, 139.77).intensity).toBe(0);
  });
});

describe('canvasSize', () => {
  it('scales css size by dpr and render scale', () => {
    expect(canvasSize(800, 600, 2, 0.5)).toEqual([800, 600]);
    expect(canvasSize(0, 0, 1, 1)).toEqual([1, 1]);
  });
});

describe('applyPatch', () => {
  it('starts with picking disabled', () => {
    expect(initialViewState.picking).toBe(false);
  });
  it('merges patches', () => {
    expect(applyPatch(initialViewState, { minutes: 60 }).minutes).toBe(60);
  });
  it('keeps the selection while picking is enabled', () => {
    expect(applyPatch({ ...initialViewState, picking: true }, { selected: 7 }).selected).toBe(7);
  });
  it('clears the selection when picking is disabled', () => {
    const on = { ...initialViewState, picking: true, selected: 7 };
    expect(applyPatch(on, { picking: false }).selected).toBe(0);
    expect(applyPatch(initialViewState, { selected: 3 }).selected).toBe(0);
  });
});

describe('parseRefineFactor', () => {
  it('reads ?refine=N within 1..4', async () => {
    const { parseRefineFactor } = await import('./viewState');
    expect(parseRefineFactor('?refine=1')).toBe(1);
    expect(parseRefineFactor('?refine=4')).toBe(4);
  });
  it('falls back for missing or invalid values', async () => {
    const { parseRefineFactor } = await import('./viewState');
    expect(parseRefineFactor('')).toBe(2);
    expect(parseRefineFactor('?refine=9')).toBe(2);
    expect(parseRefineFactor('?refine=abc')).toBe(2);
  });
});

describe('daylightRange', () => {
  it('gives Tokyo sunrise ~4:25 and sunset ~19:00 on the 2026 summer solstice', async () => {
    const { daylightRange, SUMMER_SOLSTICE_2026 } = await import('./viewState');
    const r = daylightRange(SUMMER_SOLSTICE_2026, 35.681, 139.767)!;
    // NAOJ: sunrise 4:25, sunset 19:00 (upper limb, with refraction); geometric centre is a few minutes later/earlier
    expect(r.sunrise).toBeGreaterThanOrEqual(4 * 60 + 25);
    expect(r.sunrise).toBeLessThanOrEqual(4 * 60 + 33);
    expect(r.sunset).toBeGreaterThanOrEqual(18 * 60 + 52);
    expect(r.sunset).toBeLessThanOrEqual(19 * 60);
  });
  it('returns null during polar night', async () => {
    const { daylightRange } = await import('./viewState');
    expect(daylightRange('2026-12-21', 85, 0)).toBeNull();
  });
});

describe('nextDaylightMinute', () => {
  it('advances within daylight and wraps from sunset to sunrise', async () => {
    const { nextDaylightMinute } = await import('./viewState');
    const r = { sunrise: 270, sunset: 1140 };
    expect(nextDaylightMinute(600, 2, r)).toBe(602);
    expect(nextDaylightMinute(1139, 2, r)).toBe(1140);
    expect(nextDaylightMinute(1140, 2, r)).toBe(270);
  });
  it('jumps to sunrise from night time', async () => {
    const { nextDaylightMinute } = await import('./viewState');
    const r = { sunrise: 270, sunset: 1140 };
    expect(nextDaylightMinute(30, 2, r)).toBe(270);
    expect(nextDaylightMinute(1300, 2, r)).toBe(270);
  });
});

describe('initial date', () => {
  it('starts on the 2026 summer solstice', async () => {
    const { initialViewState, SUMMER_SOLSTICE_2026 } = await import('./viewState');
    expect(initialViewState.date).toBe(SUMMER_SOLSTICE_2026);
  });
});

describe('clampToDaylight', () => {
  it('clamps into [sunrise, sunset]', async () => {
    const { clampToDaylight } = await import('./viewState');
    const r = { sunrise: 270, sunset: 1140 };
    expect(clampToDaylight(100, r)).toBe(270);
    expect(clampToDaylight(1300, r)).toBe(1140);
    expect(clampToDaylight(600, r)).toBe(600);
  });
  it('leaves the time alone without daylight', async () => {
    const { clampToDaylight } = await import('./viewState');
    expect(clampToDaylight(100, null)).toBe(100);
  });
});

describe('areaPagePath', () => {
  it('maps a slug to its page and empty to the station page', () => {
    expect(areaPagePath('nagoya')).toBe('/nagoya/');
    expect(areaPagePath('')).toBe('/');
  });
});

describe('isAnimated', () => {
  it('only the height-wave colour mode needs continuous repaints', () => {
    expect(isAnimated({ colorMode: ColorMode.Waves })).toBe(true);
    for (const m of [ColorMode.Surface, ColorMode.Height, ColorMode.Usage, ColorMode.Year, ColorMode.Steps]) {
      expect(isAnimated({ colorMode: m })).toBe(false);
    }
  });
});

import { describe, expect, it } from 'vitest';
import { ATLAS_SLOTS_X, atlasBytes, computeAtlasLayout, slotOrigin } from './atlasLayout';

describe('computeAtlasLayout', () => {
  it('uses one layer for small slot counts', () => {
    const l = computeAtlasLayout(10);
    expect(l).toEqual({ slotsX: 128, slotsY: 1, slotsZ: 1, size: [1152, 9, 9] });
  });
  it('fills y up to the texture limit before z', () => {
    const l = computeAtlasLayout(128 * 227 + 1);
    expect(l.slotsY).toBe(227);
    expect(l.slotsZ).toBe(2);
  });
  it('keeps rows 256-byte aligned for r16float', () => {
    expect((computeAtlasLayout(1).size[0] * 2) % 256).toBe(0);
    expect(ATLAS_SLOTS_X).toBe(128);
  });
  it('throws when exceeding the 3D texture limit', () => {
    expect(() => computeAtlasLayout(128 * 227 * 228)).toThrow();
  });
});

describe('slotOrigin', () => {
  it('lays slots out x-fastest', () => {
    const l = computeAtlasLayout(1000);
    expect(slotOrigin(l, 0)).toEqual([0, 0, 0]);
    expect(slotOrigin(l, 129)).toEqual([9, 9, 0]);
    expect(slotOrigin(l, 128 * l.slotsY)).toEqual([0, 0, 9]);
  });
});

describe('atlasBytes', () => {
  it('counts 2 bytes per sample', () => {
    expect(atlasBytes(computeAtlasLayout(1))).toBe(1152 * 9 * 9 * 2);
  });
});

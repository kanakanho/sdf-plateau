import { describe, expect, it, vi } from 'vitest';
import type { CustomRenderMethodInput } from 'maplibre-gl';
import {
  MAPLIBRE_ATTRIBUTION,
  PLATEAU_ATTRIBUTION,
  baseMapStyle,
  createSyncLayer,
  extractMercatorMatrix,
  mapAttributions,
} from './syncLayer';

const fakeInput = (m: number[]) =>
  ({ defaultProjectionData: { mainMatrix: Float64Array.from(m) } }) as unknown as CustomRenderMethodInput;

describe('extractMercatorMatrix', () => {
  it('copies the main matrix as float64', () => {
    const src = Array.from({ length: 16 }, (_, i) => i + 0.123456789012);
    const input = fakeInput(src);
    const m = extractMercatorMatrix(input);
    expect(m).toBeInstanceOf(Float64Array);
    expect(Array.from(m)).toEqual(src);
    expect(m).not.toBe(input.defaultProjectionData.mainMatrix);
  });
});

describe('createSyncLayer', () => {
  it('is a 3d custom layer that forwards the matrix on render', () => {
    const cb = vi.fn();
    const layer = createSyncLayer('sync', cb);
    expect(layer.type).toBe('custom');
    expect(layer.renderingMode).toBe('3d');
    layer.render({} as WebGL2RenderingContext, fakeInput(Array(16).fill(2)));
    expect(cb).toHaveBeenCalledWith(Float64Array.from(Array(16).fill(2)));
  });
});

describe('baseMapStyle', () => {
  it('builds a GSI raster style for the requested base map', () => {
    const s = baseMapStyle('photo');
    const src = s.sources.gsi as { tiles: string[]; attribution: string };
    expect(src.tiles[0]).toContain('seamlessphoto');
    expect(src.attribution).toContain('地理院タイル');
    expect(s.layers).toHaveLength(1);
  });
  it('defaults to the pale map', () => {
    expect((baseMapStyle().sources.gsi as { tiles: string[] }).tiles[0]).toContain('/pale/');
  });
  it('white is a plain white background without tile sources', () => {
    const s = baseMapStyle('white');
    expect(s.sources).toEqual({});
    expect(s.layers).toEqual([{ id: 'background', type: 'background', paint: { 'background-color': '#ffffff' } }]);
  });
});

describe('PLATEAU_ATTRIBUTION', () => {
  it('credits the source and states that the data was processed', () => {
    expect(PLATEAU_ATTRIBUTION).toContain('PLATEAU');
    expect(PLATEAU_ATTRIBUTION).toContain('千代田区');
    expect(PLATEAU_ATTRIBUTION).toContain('加工して作成');
  });
});

describe('mapAttributions', () => {
  it('keeps the MapLibre credit next to the PLATEAU credit', () => {
    expect(mapAttributions()).toEqual([MAPLIBRE_ATTRIBUTION, PLATEAU_ATTRIBUTION]);
    expect(MAPLIBRE_ATTRIBUTION).toContain('https://maplibre.org/');
  });
});

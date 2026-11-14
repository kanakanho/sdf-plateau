import { describe, expect, it } from 'vitest';
import { AREAS, type AreaConfig, findArea, slugError, validateAreas } from './areas';

const area = (slug: string, cityCode = '13101'): AreaConfig => ({
  slug,
  name: 'x',
  cityCode,
  datasetUrl: 'https://example.com',
  datasetYear: 2025,
});

describe('slugError', () => {
  it('accepts lowercase slugs', () => {
    expect(slugError('chiyodaku')).toBeNull();
    expect(slugError('minato-ku2')).toBeNull();
  });
  it('rejects reserved slugs', () => {
    for (const s of ['data', 'assets', '_astro', '404']) expect(slugError(s)).not.toBeNull();
  });
  it('rejects malformed slugs', () => {
    for (const s of ['', 'Nagoya', '1abc', 'a/b', 'a.b', '-a']) expect(slugError(s)).not.toBeNull();
  });
});

describe('validateAreas', () => {
  it('accepts the configured areas', () => {
    expect(() => validateAreas(AREAS)).not.toThrow();
    expect(AREAS.map((a) => a.slug)).toEqual(['chiyodaku', 'nagoya']);
  });
  it('rejects reserved and duplicated slugs', () => {
    expect(() => validateAreas([area('data')])).toThrow(/reserved/);
    expect(() => validateAreas([area('a'), area('a')])).toThrow(/duplicated/);
  });
  it('rejects malformed city codes and voxel sizes', () => {
    expect(() => validateAreas([area('a', '131')])).toThrow(/cityCode/);
    expect(() => validateAreas([{ ...area('a'), voxelSize: 0 }])).toThrow(/voxelSize/);
  });
});

describe('findArea', () => {
  it('finds by slug or throws', () => {
    expect(findArea(AREAS, 'nagoya').cityCode).toBe('23100');
    expect(() => findArea(AREAS, 'osaka')).toThrow(/unknown area/);
  });
});

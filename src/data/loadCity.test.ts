import { describe, expect, it } from 'vitest';
import { loadCity } from './loadCity';
import { gzip } from './gzip';
import { encodeCityMesh } from './meshFormat';

const mesh = {
  positions: new Float32Array(9),
  triInfo: new Uint32Array(1),
  buildingRanges: new Uint32Array([0, 1]),
  boundsMin: [0, 0, 0] as [number, number, number],
  boundsMax: [1, 1, 1] as [number, number, number],
};
const meta = { origin: { lng: 139.7, lat: 35.6 }, meshes: ['x'], buildings: [{ gmlId: 'a', lod: 2, groundElevation: 0 }] };

const fakeFetch = (ok: boolean, compressed = true) =>
  (async (url: string) => {
    if (url.endsWith('.json')) return new Response(JSON.stringify(meta), { status: ok ? 200 : 404 });
    if (!url.endsWith('/city.bin.gz')) return new Response('', { status: 404 });
    const bin = encodeCityMesh(mesh);
    return new Response(compressed ? await gzip(bin) : bin, { status: ok ? 200 : 404 });
  }) as unknown as typeof fetch;

describe('loadCity', () => {
  it('fetches and decodes both files', async () => {
    const city = await loadCity('/data', fakeFetch(true));
    expect(city.mesh.triInfo).toHaveLength(1);
    expect(city.meta.buildings[0].gmlId).toBe('a');
  });
  it('accepts a mesh the server already decoded (Content-Encoding: gzip)', async () => {
    const city = await loadCity('/data', fakeFetch(true, false));
    expect(city.mesh.buildingRanges).toHaveLength(2);
  });
  it('fails with a helpful message when files are missing', async () => {
    await expect(loadCity('/data', fakeFetch(false))).rejects.toThrow(/preprocess/);
  });
});

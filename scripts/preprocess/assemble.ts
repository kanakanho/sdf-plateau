/** Accumulates per-building geometry into the flat CityMesh arrays (pure, no I/O). */
import type { BuildingAttributes } from '../../src/data/buildings';
import { type CityMesh, computeBounds, packTriInfo } from '../../src/data/meshFormat';
import type { BuildingGeometry } from './buildMesh';
import type { ParsedAttributes } from './gml';

export type BuildingRecord = { readonly attrs: ParsedAttributes; readonly geometry: BuildingGeometry };

/** Keeps the first record for each gml:id (the same building can appear in several mesh files). */
export const dedupeByGmlId = <T extends { attrs: { gmlId: string } }>(records: readonly T[]): T[] => {
  const seen = new Set<string>();
  return records.filter((r) => (seen.has(r.attrs.gmlId) ? false : (seen.add(r.attrs.gmlId), true)));
};

export const assembleCityMesh = (
  records: readonly BuildingRecord[],
): { mesh: CityMesh; buildings: BuildingAttributes[] } => {
  const triCount = records.reduce((s, r) => s + r.geometry.surfaceTypes.length, 0);
  const positions = new Float32Array(triCount * 9);
  const triInfo = new Uint32Array(triCount);
  const buildingRanges = new Uint32Array(records.length * 2);
  const buildings: BuildingAttributes[] = [];
  let t = 0;
  records.forEach((r, bi) => {
    const n = r.geometry.surfaceTypes.length;
    positions.set(r.geometry.positions, t * 9);
    for (let k = 0; k < n; k++) triInfo[t + k] = packTriInfo(bi, r.geometry.surfaceTypes[k]);
    buildingRanges[bi * 2] = t;
    buildingRanges[bi * 2 + 1] = n;
    t += n;
    buildings.push({ ...r.attrs, lod: r.geometry.lod, groundElevation: r.geometry.groundElevation });
  });
  const { min, max } = computeBounds(positions);
  return { mesh: { positions, triInfo, buildingRanges, boundsMin: min, boundsMax: max }, buildings };
};

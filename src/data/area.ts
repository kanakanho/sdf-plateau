/** Manifest of an area served as streamed LOD1 tiles (public/data/<slug>/area.json). */

export type AreaTile = {
  readonly ix: number;
  readonly iy: number;
  /** home buildings: area-wide indices [buildingStart, buildingStart + count) */
  readonly buildingStart: number;
  readonly count: number;
  /** highest roof among the buildings stored in the tile [m] */
  readonly maxZ: number;
};

export type AreaManifest = {
  readonly slug: string;
  readonly name: string;
  /** local frame origin */
  readonly origin: { readonly lng: number; readonly lat: number };
  readonly view?: { readonly zoom: number; readonly pitch: number; readonly bearing: number };
  readonly voxelSize: number;
  readonly tileSize: number;
  /** min corner of tile (0, 0) in local meters, and the grid size in tiles */
  readonly grid: { readonly originX: number; readonly originY: number; readonly nx: number; readonly ny: number };
  readonly buildingCount: number;
  /** non-empty tiles, row-major (so buildingStart is ascending) */
  readonly tiles: readonly AreaTile[];
  readonly attribution: { readonly name: string; readonly url: string; readonly year: number };
};

/** Entry of public/data/areas.json. */
export type AreaSummary = { readonly slug: string; readonly name: string };

/** Path of a tile file relative to the area directory. */
export const tilePath = (ix: number, iy: number, ext: 'bin.gz' | 'json.gz'): string => `tiles/${ix}_${iy}.${ext}`;

/** Position in `tiles` of the home tile of an area-wide building index (binary search), or -1. */
export const homeTileIndex = (tiles: readonly AreaTile[], building: number): number => {
  let lo = 0;
  let hi = tiles.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const t = tiles[mid];
    if (building < t.buildingStart) hi = mid - 1;
    else if (building >= t.buildingStart + t.count) lo = mid + 1;
    else return mid;
  }
  return -1;
};

/** Inserts or replaces an area in the list, sorted by slug. */
export const upsertAreaSummary = (list: readonly AreaSummary[], entry: AreaSummary): AreaSummary[] =>
  [...list.filter((a) => a.slug !== entry.slug), entry].sort((a, b) => (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0));

/** Slug of the height-wave page (/waves/); reserved, so no area page can take it. */
export const WAVES_SLUG = 'waves';

/** Reads the area list (contents of public/data/areas.json); invalid or missing input gives []. */
export const parseAreaList = (json: string | null): AreaSummary[] => {
  if (!json) return [];
  const v: unknown = JSON.parse(json);
  if (!Array.isArray(v)) return [];
  return v.filter(
    (a): a is AreaSummary =>
      typeof a === 'object' && a !== null && typeof a.slug === 'string' && typeof a.name === 'string' && a.slug !== WAVES_SLUG,
  );
};

/** Page description of an area page. */
export const areaDescription = (name: string): string =>
  `PLATEAU の 3D 都市モデル（${name}・LOD1）を表示範囲のタイルごとに WebGPU 上で SDF に焼き込み、レイマーチで描画して MapLibre の地図に重ねる Web アプリケーション。`;

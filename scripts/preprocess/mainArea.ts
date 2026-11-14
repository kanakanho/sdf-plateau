/**
 * CLI: CityGML (PLATEAU bldg, EPSG:6697) of one area -> LOD1 tiles
 *   tsx scripts/preprocess/mainArea.ts <slug>
 * reads   data/raw/<slug>/*.gml
 * writes  public/data/<slug>/area.json, public/data/<slug>/tiles/<ix>_<iy>.{bin.gz,json.gz},
 *         and adds the area to public/data/areas.json
 * I/O lives here only; all transformation logic is in pure, tested modules.
 */
import { createReadStream, existsSync } from 'node:fs';
import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import { gzipSync } from 'node:zlib';
import { type AreaManifest, type AreaSummary, type AreaTile, tilePath, upsertAreaSummary } from '../../src/data/area';
import type { BuildingAttributes } from '../../src/data/buildings';
import { attributeVec4, encodeTile } from '../../src/data/tileFormat';
import { createLocalFrame, lngLatToLocal } from '../../src/geo/localFrame';
import { AREAS, DEFAULT_VOXEL_SIZE, findArea, validateAreas } from './areas';
import { type ParsedAttributes, extractLod1Polygons, parseAttributes, splitBuildings } from './gml';
import { type Lod1SkipReason, lod1Prism } from './lod1Prism';
import { DEFAULT_TILE_SIZE, assignBuildings, footprintCentroid, gridFromBounds, tileMargin } from './tiling';

const CLOUDFLARE_FILE_LIMIT = 25 * 1024 * 1024;

const slug = process.argv[2];
if (!slug) throw new Error('usage: tsx scripts/preprocess/mainArea.ts <slug>');
validateAreas(AREAS);
const config = findArea(AREAS, slug);
const inputDir = join('data/raw', slug);
const outDir = join('public/data', slug);
if (!existsSync(inputDir)) {
  console.error(`${inputDir} does not exist: put the ${config.name} CityGML (udx/bldg/*.gml) there first`);
  process.exit(1);
}
const files = (await readdir(inputDir)).filter((f) => f.endsWith('.gml')).sort();
if (!files.length) throw new Error(`no .gml files in ${inputDir}`);

// per building: attributes, footprint (lng/lat until the origin is known, then local x/y), rings, heights
const attrs: ParsedAttributes[] = [];
const coords: (Float64Array | Float32Array)[] = [];
const rings: Uint32Array[] = [];
const heightList: number[] = [];
const groundList: number[] = [];
const seen = new Set<string>();
const skipped: Record<Lod1SkipReason, number> = { noPolygons: 0, noHorizontalFace: 0, flat: 0, degenerate: 0 };
let duplicates = 0;
const lngLatMin = [Infinity, Infinity];
const lngLatMax = [-Infinity, -Infinity];

for (const file of files) {
  const lines = createInterface({ input: createReadStream(join(inputDir, file), 'utf8'), crlfDelay: Infinity });
  let n = 0;
  for await (const xml of splitBuildings(lines)) {
    n++;
    // copy the attribute strings: regex captures are slices that would keep the whole building XML alive
    const a: ParsedAttributes = JSON.parse(JSON.stringify(parseAttributes(xml)));
    if (seen.has(a.gmlId)) {
      duplicates++;
      continue;
    }
    seen.add(a.gmlId);
    const r = lod1Prism(extractLod1Polygons(xml));
    if ('skip' in r) {
      skipped[r.skip]++;
      continue;
    }
    const { prism } = r;
    for (let i = 0; i < prism.coords.length; i += 2) {
      for (let k = 0; k < 2; k++) {
        lngLatMin[k] = Math.min(lngLatMin[k], prism.coords[i + k]);
        lngLatMax[k] = Math.max(lngLatMax[k], prism.coords[i + k]);
      }
    }
    attrs.push(a);
    coords.push(prism.coords);
    rings.push(prism.rings);
    heightList.push(prism.height);
    groundList.push(prism.groundElevation);
  }
  console.log(`${file}: ${n} buildings`);
}
const count = attrs.length;
if (!count) throw new Error('no LOD1 buildings found');

const origin = config.origin ?? { lng: (lngLatMin[0] + lngLatMax[0]) / 2, lat: (lngLatMin[1] + lngLatMax[1]) / 2 };
const frame = createLocalFrame(origin.lng, origin.lat);
const heights = Float32Array.from(heightList);
const bboxes = new Float32Array(count * 4);
const centroids = new Float32Array(count * 2);
const min: [number, number] = [Infinity, Infinity];
const max: [number, number] = [-Infinity, -Infinity];
for (let i = 0; i < count; i++) {
  const ll = coords[i];
  const local = new Float32Array(ll.length);
  const bmin = [Infinity, Infinity];
  const bmax = [-Infinity, -Infinity];
  for (let k = 0; k < ll.length; k += 2) {
    const [x, y] = lngLatToLocal(frame, ll[k], ll[k + 1]);
    local[k] = x;
    local[k + 1] = y;
    bmin[0] = Math.min(bmin[0], x);
    bmin[1] = Math.min(bmin[1], y);
    bmax[0] = Math.max(bmax[0], x);
    bmax[1] = Math.max(bmax[1], y);
  }
  coords[i] = local;
  bboxes.set([bmin[0], bmin[1], bmax[0], bmax[1]], i * 4);
  centroids.set(footprintCentroid(local, rings[i]), i * 2);
  for (let k = 0; k < 2; k++) {
    min[k] = Math.min(min[k], bmin[k]);
    max[k] = Math.max(max[k], bmax[k]);
  }
}

const voxelSize = config.voxelSize ?? DEFAULT_VOXEL_SIZE;
const tileSize = DEFAULT_TILE_SIZE;
const margin = tileMargin(voxelSize);
const grid = gridFromBounds(min, max, tileSize, margin);
const { order, tiles } = assignBuildings(grid, bboxes, centroids, margin);

await rm(join(outDir, 'tiles'), { recursive: true, force: true });
await mkdir(join(outDir, 'tiles'), { recursive: true });
const manifestTiles: AreaTile[] = [];
let totalBytes = 0;
let largest = 0;
for (const t of tiles) {
  const m = t.members.length;
  const src = Array.from(t.members, (g) => order[g]);
  const ringTotal = src.reduce((s, i) => s + rings[i].length, 0);
  const vertTotal = src.reduce((s, i) => s + coords[i].length / 2, 0);
  const tileHeights = new Float32Array(m);
  const attributes = new Float32Array(m * 4);
  const ringCounts = new Uint32Array(m);
  const tileRings = new Uint32Array(ringTotal);
  const positions = new Float32Array(vertTotal * 2);
  let ro = 0;
  let vo = 0;
  src.forEach((i, j) => {
    tileHeights[j] = heights[i];
    attributes.set(attributeVec4(attrs[i], heights[i], 1), j * 4);
    ringCounts[j] = rings[i].length;
    tileRings.set(rings[i], ro);
    ro += rings[i].length;
    positions.set(coords[i], vo);
    vo += coords[i].length;
  });
  const bin = gzipSync(
    new Uint8Array(
      encodeTile({
        ix: t.ix,
        iy: t.iy,
        origin: [grid.originX + t.ix * tileSize, grid.originY + t.iy * tileSize],
        indices: t.members,
        heights: tileHeights,
        attributes,
        ringCounts,
        rings: tileRings,
        positions,
      }),
    ),
    { level: 9 },
  );
  const home: BuildingAttributes[] = Array.from({ length: t.count }, (_, k) => {
    const i = order[t.buildingStart + k];
    return { ...attrs[i], lod: 1, groundElevation: groundList[i] };
  });
  // attributes compress about 6x; the viewer gunzips them like the meshes
  const json = gzipSync(JSON.stringify(home), { level: 9 });
  await writeFile(join(outDir, tilePath(t.ix, t.iy, 'bin.gz')), bin);
  await writeFile(join(outDir, tilePath(t.ix, t.iy, 'json.gz')), json);
  totalBytes += bin.byteLength + json.byteLength;
  largest = Math.max(largest, bin.byteLength, json.byteLength);
  manifestTiles.push({
    ix: t.ix,
    iy: t.iy,
    buildingStart: t.buildingStart,
    count: t.count,
    // rounded up to cm so it stays an upper bound of the f32 heights
    maxZ: Math.ceil(src.reduce((z, i) => Math.max(z, heights[i]), 0) * 100) / 100,
  });
}

const manifest: AreaManifest = {
  slug: config.slug,
  name: config.name,
  origin,
  ...(config.view ? { view: config.view } : {}),
  voxelSize,
  tileSize,
  grid: { originX: grid.originX, originY: grid.originY, nx: grid.nx, ny: grid.ny },
  buildingCount: count,
  tiles: manifestTiles,
  attribution: { name: `3D都市モデル（PLATEAU）${config.name}`, url: config.datasetUrl, year: config.datasetYear },
};
await writeFile(join(outDir, 'area.json'), JSON.stringify(manifest));

const listPath = 'public/data/areas.json';
const list: AreaSummary[] = existsSync(listPath) ? JSON.parse(await readFile(listPath, 'utf8')) : [];
await writeFile(listPath, `${JSON.stringify(upsertAreaSummary(list, { slug: config.slug, name: config.name }), null, 2)}\n`);

const skippedTotal = Object.values(skipped).reduce((s, v) => s + v, 0);
const mib = (b: number) => `${(b / 1024 / 1024).toFixed(1)} MiB`;
console.log(`buildings: ${count} (skipped ${skippedTotal} ${JSON.stringify(skipped)}, duplicates ${duplicates})`);
console.log(`grid: ${grid.nx} x ${grid.ny} tiles of ${tileSize} m, ${tiles.length} non-empty`);
console.log(`bounds: [${min.map((v) => v.toFixed(1))}] .. [${max.map((v) => v.toFixed(1))}]`);
console.log(`output: ${mib(totalBytes)} in tiles, largest file ${mib(largest)}`);
if (largest > CLOUDFLARE_FILE_LIMIT) console.warn('warning: a tile file exceeds the Cloudflare 25 MiB per-file limit');

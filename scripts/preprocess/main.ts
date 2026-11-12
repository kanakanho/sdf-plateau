/**
 * CLI: CityGML (PLATEAU bldg, EPSG:6697) -> public/data/city.bin.gz + city.json
 *   pnpm preprocess [inputDir=data/raw] [outDir=public/data]
 * I/O lives here only; all transformation logic is in pure, tested modules.
 */
import { createReadStream } from 'node:fs';
import { mkdir, readdir, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { createInterface } from 'node:readline';
import { gzipSync } from 'node:zlib';
import type { CityMeta } from '../../src/data/buildings';
import { encodeCityMesh } from '../../src/data/meshFormat';
import { TOKYO_STATION, createLocalFrame } from '../../src/geo/localFrame';
import { assembleCityMesh, dedupeByGmlId, type BuildingRecord } from './assemble';
import { buildingGeometry } from './buildMesh';
import { parseAttributes, splitBuildings } from './gml';

const [inputDir = 'data/raw', outDir = 'public/data'] = process.argv.slice(2);
const frame = createLocalFrame(TOKYO_STATION.lng, TOKYO_STATION.lat);

const files = (await readdir(inputDir)).filter((f) => f.endsWith('.gml')).sort();
if (!files.length) throw new Error(`no .gml files in ${inputDir}`);

const records: BuildingRecord[] = [];
let skipped = 0;
for (const file of files) {
  const lines = createInterface({ input: createReadStream(join(inputDir, file), 'utf8'), crlfDelay: Infinity });
  let n = 0;
  for await (const xml of splitBuildings(lines)) {
    const attrs = parseAttributes(xml);
    const geometry = buildingGeometry(xml, frame);
    if (geometry) records.push({ attrs, geometry });
    else skipped++;
    n++;
  }
  console.log(`${file}: ${n} buildings`);
}

const unique = dedupeByGmlId(records);
const { mesh, buildings } = assembleCityMesh(unique);
const meta: CityMeta = {
  origin: { lng: frame.originLng, lat: frame.originLat },
  meshes: files.map((f) => basename(f, '.gml')),
  buildings,
};
await mkdir(outDir, { recursive: true });
// gzip keeps the mesh (~29 MB raw, ~5 MB compressed) under hosting per-file limits (Cloudflare: 25 MiB)
await writeFile(join(outDir, 'city.bin.gz'), gzipSync(new Uint8Array(encodeCityMesh(mesh)), { level: 9 }));
await writeFile(join(outDir, 'city.json'), JSON.stringify(meta));

const lod2 = buildings.filter((b) => b.lod === 2).length;
console.log(
  `buildings: ${unique.length} (LOD2 ${lod2}, LOD1 ${unique.length - lod2}, skipped ${skipped}, duplicates ${records.length - unique.length})`,
);
console.log(`triangles: ${mesh.triInfo.length}`);
console.log(`bounds: [${mesh.boundsMin.map((v) => v.toFixed(1))}] .. [${mesh.boundsMax.map((v) => v.toFixed(1))}]`);

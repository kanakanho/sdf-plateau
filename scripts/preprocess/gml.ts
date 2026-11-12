/**
 * Minimal, streaming-friendly CityGML (PLATEAU bldg) extraction based on targeted regexes.
 * Every function is pure over strings so it can be unit tested with small fixtures.
 */

export type LatLonH = readonly [number, number, number];
export type GmlPolygon = { readonly exterior: LatLonH[]; readonly interiors: LatLonH[][] };
export type SurfaceKind = 'wall' | 'roof' | 'ground' | 'installation' | 'other';
export type GmlSurface = { readonly kind: SurfaceKind; readonly polygons: GmlPolygon[] };

export type ParsedAttributes = {
  gmlId: string;
  buildingId?: string;
  name?: string;
  usage?: string;
  buildingClass?: string;
  measuredHeight?: number;
  storeysAboveGround?: number;
  yearOfConstruction?: number;
  address?: string;
};

const BUILDING_START = '<bldg:Building ';
const BUILDING_END = '</bldg:Building>';

/** Groups an async stream of lines into complete `<bldg:Building>` element strings. */
export async function* splitBuildings(lines: AsyncIterable<string> | Iterable<string>): AsyncGenerator<string> {
  let buf: string[] | null = null;
  for await (const line of lines) {
    if (buf === null) {
      const i = line.indexOf(BUILDING_START);
      if (i < 0) continue;
      buf = [line.slice(i)];
    } else {
      buf.push(line);
    }
    const last = buf[buf.length - 1];
    const j = last.indexOf(BUILDING_END);
    if (j >= 0) {
      buf[buf.length - 1] = last.slice(0, j + BUILDING_END.length);
      yield buf.join('\n');
      buf = null;
    }
  }
}

/** Parses a gml:posList (lat lon h triples in EPSG:6697). */
export const parsePosList = (text: string): LatLonH[] => {
  const nums = text.trim().split(/\s+/).map(Number);
  if (nums.length % 3 !== 0 || nums.some((n) => !Number.isFinite(n))) {
    throw new Error(`invalid posList (${nums.length} values)`);
  }
  const out: LatLonH[] = [];
  for (let i = 0; i < nums.length; i += 3) out.push([nums[i], nums[i + 1], nums[i + 2]]);
  return out;
};

const firstPosList = (xml: string): LatLonH[] | null => {
  const m = /<gml:posList[^>]*>([^<]*)<\/gml:posList>/.exec(xml);
  return m ? parsePosList(m[1]) : null;
};

/** Extracts all gml:Polygon elements (exterior + interior rings) from an XML fragment. */
export const parsePolygons = (xml: string): GmlPolygon[] => {
  const out: GmlPolygon[] = [];
  const re = /<gml:Polygon\b[^>]*>([\s\S]*?)<\/gml:Polygon>/g;
  for (let m = re.exec(xml); m; m = re.exec(xml)) {
    const body = m[1];
    const ext = /<gml:exterior>([\s\S]*?)<\/gml:exterior>/.exec(body);
    const exterior = ext ? firstPosList(ext[1]) : null;
    if (!exterior) continue;
    const interiors: LatLonH[][] = [];
    const ire = /<gml:interior>([\s\S]*?)<\/gml:interior>/g;
    for (let im = ire.exec(body); im; im = ire.exec(body)) {
      const ring = firstPosList(im[1]);
      if (ring) interiors.push(ring);
    }
    out.push({ exterior, interiors });
  }
  return out;
};

const SURFACE_KIND: Record<string, SurfaceKind> = {
  WallSurface: 'wall',
  RoofSurface: 'roof',
  GroundSurface: 'ground',
  ClosureSurface: 'other',
  OuterCeilingSurface: 'other',
  OuterFloorSurface: 'other',
};

/** LOD2 thematic surfaces (bldg:boundedBy) and building installations (bldg:lod2Geometry). */
export const extractLod2Surfaces = (xml: string): GmlSurface[] => {
  const out: GmlSurface[] = [];
  const re =
    /<bldg:(WallSurface|RoofSurface|GroundSurface|ClosureSurface|OuterCeilingSurface|OuterFloorSurface)\b[^>]*>([\s\S]*?)<\/bldg:\1>/g;
  for (let m = re.exec(xml); m; m = re.exec(xml)) {
    const lod2 = /<bldg:lod2MultiSurface>([\s\S]*?)<\/bldg:lod2MultiSurface>/.exec(m[2]);
    if (!lod2) continue;
    const polygons = parsePolygons(lod2[1]);
    if (polygons.length) out.push({ kind: SURFACE_KIND[m[1]], polygons });
  }
  const ire = /<bldg:lod2Geometry>([\s\S]*?)<\/bldg:lod2Geometry>/g;
  for (let m = ire.exec(xml); m; m = ire.exec(xml)) {
    const polygons = parsePolygons(m[1]);
    if (polygons.length) out.push({ kind: 'installation', polygons });
  }
  return out;
};

export const extractLod1Polygons = (xml: string): GmlPolygon[] => {
  const m = /<bldg:lod1Solid>([\s\S]*?)<\/bldg:lod1Solid>/.exec(xml);
  return m ? parsePolygons(m[1]) : [];
};

const text = (xml: string, re: RegExp): string | undefined => {
  const m = re.exec(xml);
  return m ? m[1].trim() : undefined;
};

/** PLATEAU encodes "unknown" as 9999 / -9999 in numeric attributes. */
export const isUnknownSentinel = (n: number): boolean => Math.abs(n) === 9999;

const num = (s: string | undefined): number | undefined => {
  if (s === undefined) return undefined;
  const n = Number(s);
  return Number.isFinite(n) && !isUnknownSentinel(n) ? n : undefined;
};

export const parseAttributes = (xml: string): ParsedAttributes => {
  const gmlId = text(xml, /<bldg:Building gml:id="([^"]+)"/);
  if (!gmlId) throw new Error('bldg:Building without gml:id');
  const storeys = num(text(xml, /<bldg:storeysAboveGround>([^<]*)</));
  const year = num(text(xml, /<bldg:yearOfConstruction>([^<]*)</));
  const height = num(text(xml, /<bldg:measuredHeight[^>]*>([^<]*)</));
  return {
    gmlId,
    buildingId: text(xml, /<uro:buildingID>([^<]*)</),
    name: text(xml, /<gml:name>([^<]*)</),
    usage: text(xml, /<bldg:usage[^>]*>([^<]*)</),
    buildingClass: text(xml, /<bldg:class[^>]*>([^<]*)</),
    measuredHeight: height !== undefined && height > 0 ? height : undefined,
    storeysAboveGround: storeys !== undefined && storeys > 0 ? storeys : undefined,
    yearOfConstruction: year !== undefined && year > 0 ? year : undefined,
    address: text(xml, /<xAL:LocalityName[^>]*>([^<]*)</),
  };
};

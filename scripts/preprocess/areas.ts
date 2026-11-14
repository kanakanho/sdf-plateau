/**
 * Per-municipality areas served as streamed LOD1 tiles (`/<slug>`).
 * Add an entry here and put the CityGML under data/raw/<slug>/ to add an area.
 */

export type AreaConfig = {
  /** URL path segment, e.g. 'nagoya' */
  readonly slug: string;
  /** display name, e.g. '名古屋市' */
  readonly name: string;
  /** 5-digit municipality code */
  readonly cityCode: string;
  /** distribution page on G空間情報センター (attribution) */
  readonly datasetUrl: string;
  readonly datasetYear: number;
  /** local frame origin; defaults to the centre of the data bbox */
  readonly origin?: { readonly lng: number; readonly lat: number };
  readonly view?: { readonly zoom: number; readonly pitch: number; readonly bearing: number };
  /** meters, default DEFAULT_VOXEL_SIZE */
  readonly voxelSize?: number;
};

export const DEFAULT_VOXEL_SIZE = 2;

export const AREAS: readonly AreaConfig[] = [
  {
    slug: 'chiyodaku',
    name: '千代田区',
    cityCode: '13101',
    datasetUrl: 'https://www.geospatial.jp/ckan/dataset/plateau-13101-chiyoda-ku-2025',
    datasetYear: 2025,
    // Tokyo Station (same anchor as the LOD2 page): the data centre is the Imperial Palace, which has no buildings
    origin: { lng: 139.767125, lat: 35.681236 },
    view: { zoom: 15.5, pitch: 60, bearing: -20 },
  },
  {
    slug: 'nagoya',
    name: '名古屋市',
    cityCode: '23100',
    datasetUrl: 'https://www.geospatial.jp/ckan/dataset/plateau-23100-nagoya-shi-2022',
    datasetYear: 2022,
    // Nagoya Station: the page opens here and the local frame is anchored on it
    origin: { lng: 136.881537, lat: 35.170915 },
    view: { zoom: 15.5, pitch: 60, bearing: -20 },
  },
];

/** Path segments already used by the static site (assets, data, Astro output, error pages). */
export const RESERVED_SLUGS: ReadonlySet<string> = new Set([
  'data',
  'assets',
  '_astro',
  '404',
  'index',
  'api',
  'favicon.ico',
  'robots.txt',
]);

const SLUG_RE = /^[a-z][a-z0-9-]*$/;

/** Returns why a slug cannot be used, or null if it is valid. */
export const slugError = (slug: string): string | null => {
  if (!SLUG_RE.test(slug)) return `slug "${slug}" must match ${SLUG_RE}`;
  if (RESERVED_SLUGS.has(slug)) return `slug "${slug}" is reserved`;
  return null;
};

/** Throws on invalid or duplicated slugs and malformed city codes. */
export const validateAreas = (areas: readonly AreaConfig[]): void => {
  const seen = new Set<string>();
  for (const a of areas) {
    const err = slugError(a.slug);
    if (err) throw new Error(err);
    if (seen.has(a.slug)) throw new Error(`duplicated slug "${a.slug}"`);
    seen.add(a.slug);
    if (!/^\d{5}$/.test(a.cityCode)) throw new Error(`${a.slug}: cityCode must be 5 digits`);
    if (a.voxelSize !== undefined && !(a.voxelSize > 0)) throw new Error(`${a.slug}: voxelSize must be positive`);
  }
};

export const findArea = (areas: readonly AreaConfig[], slug: string): AreaConfig => {
  const a = areas.find((x) => x.slug === slug);
  if (!a) throw new Error(`unknown area "${slug}" (known: ${areas.map((x) => x.slug).join(', ')})`);
  return a;
};

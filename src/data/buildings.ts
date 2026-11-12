/** Building attribute records (JSON side-car of the binary mesh). */
export type BuildingAttributes = {
  readonly gmlId: string;
  readonly buildingId?: string;
  readonly name?: string;
  readonly usage?: string;
  readonly buildingClass?: string;
  readonly measuredHeight?: number;
  readonly storeysAboveGround?: number;
  readonly yearOfConstruction?: number;
  readonly address?: string;
  /** highest LOD actually used for the mesh */
  readonly lod: 1 | 2;
  /** ground elevation (T.P. meters) subtracted from z */
  readonly groundElevation: number;
};

export type CityMeta = {
  readonly origin: { readonly lng: number; readonly lat: number };
  readonly meshes: readonly string[];
  readonly buildings: readonly BuildingAttributes[];
};

/** PLATEAU Building_usage codelist (subset of the most common codes). */
export const USAGE_LABELS: Readonly<Record<string, string>> = {
  '401': '業務施設',
  '402': '商業施設',
  '403': '宿泊施設',
  '404': '商業系複合施設',
  '411': '住宅',
  '412': '共同住宅',
  '413': '店舗等併用住宅',
  '414': '店舗等併用共同住宅',
  '415': '作業所併用住宅',
  '421': '官公庁施設',
  '422': '文教厚生施設',
  '431': '運輸倉庫施設',
  '441': '工場',
  '451': '農林漁業用施設',
  '452': '供給処理施設',
  '453': '防衛施設',
  '454': 'その他',
  '461': '不明',
};

export const usageLabel = (code: string | undefined): string =>
  code === undefined ? '不明' : (USAGE_LABELS[code] ?? `コード ${code}`);

/** Small integer category per usage code, used for GPU colouring (0 = unknown). */
export const usageCategory = (code: string | undefined): number => {
  switch (code) {
    case '401':
      return 1; // office
    case '402':
    case '404':
      return 2; // commercial
    case '403':
      return 3; // hotel
    case '411':
    case '412':
    case '413':
    case '414':
    case '415':
      return 4; // residential
    case '421':
    case '422':
      return 5; // public
    case '431':
    case '441':
    case '452':
      return 6; // industrial / logistics
    default:
      return 0;
  }
};

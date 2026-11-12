/**
 * MapLibre integration: a no-op custom layer whose render() hands the current
 * mercator->clip matrix to a callback, so the WebGPU overlay renders in lock-step with the map.
 */
import type { CustomLayerInterface, CustomRenderMethodInput, StyleSpecification } from 'maplibre-gl';

/** Copies MapLibre's mercator(0..1) -> GL clip matrix (float64) out of the render input. */
export const extractMercatorMatrix = (options: Pick<CustomRenderMethodInput, 'defaultProjectionData'>): Float64Array =>
  Float64Array.from(options.defaultProjectionData.mainMatrix as ArrayLike<number>);

export const createSyncLayer = (id: string, onRender: (mercatorToClip: Float64Array) => void): CustomLayerInterface => ({
  id,
  type: 'custom',
  renderingMode: '3d',
  render: (_gl, options) => onRender(extractMercatorMatrix(options)),
});

export type BaseMap = 'pale' | 'photo' | 'std' | 'white';

const TILE_URL: Record<Exclude<BaseMap, 'white'>, string> = {
  pale: 'https://cyberjapandata.gsi.go.jp/xyz/pale/{z}/{x}/{y}.png',
  std: 'https://cyberjapandata.gsi.go.jp/xyz/std/{z}/{x}/{y}.png',
  photo: 'https://cyberjapandata.gsi.go.jp/xyz/seamlessphoto/{z}/{x}/{y}.jpg',
};

const GSI_ATTRIBUTION = '<a href="https://maps.gsi.go.jp/development/ichiran.html" target="_blank">地理院タイル</a>';

/**
 * Credit for the redistributed (processed) PLATEAU data. Shown through the attribution control
 * so it stays visible whatever the base map is, including the plain white one.
 */
export const PLATEAU_ATTRIBUTION =
  '<a href="https://www.geospatial.jp/ckan/dataset/plateau-13101-chiyoda-ku-2025" target="_blank">3D都市モデル（PLATEAU）千代田区</a>を加工して作成';

/** MapLibre's own credit (its default custom attribution, kept when we add ours). */
export const MAPLIBRE_ATTRIBUTION = '<a href="https://maplibre.org/" target="_blank">MapLibre</a>';

/** Custom attributions for the map: MapLibre plus the processed PLATEAU data. */
export const mapAttributions = (): string[] => [MAPLIBRE_ATTRIBUTION, PLATEAU_ATTRIBUTION];

/** Base map style: GSI (地理院タイル) raster tiles, or a plain white background without tiles. */
export const baseMapStyle = (base: BaseMap = 'pale'): StyleSpecification =>
  base === 'white'
    ? { version: 8, sources: {}, layers: [{ id: 'background', type: 'background', paint: { 'background-color': '#ffffff' } }] }
    : {
        version: 8,
        sources: {
          gsi: { type: 'raster', tiles: [TILE_URL[base]], tileSize: 256, maxzoom: 18, attribution: GSI_ATTRIBUTION },
        },
        layers: [{ id: 'gsi', type: 'raster', source: 'gsi' }],
      };

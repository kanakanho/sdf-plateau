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

export type BaseMap = 'pale' | 'photo' | 'std';

const TILE_URL: Record<BaseMap, string> = {
  pale: 'https://cyberjapandata.gsi.go.jp/xyz/pale/{z}/{x}/{y}.png',
  std: 'https://cyberjapandata.gsi.go.jp/xyz/std/{z}/{x}/{y}.png',
  photo: 'https://cyberjapandata.gsi.go.jp/xyz/seamlessphoto/{z}/{x}/{y}.jpg',
};

/** Minimal raster style using GSI (地理院タイル) base maps. */
export const gsiStyle = (base: BaseMap = 'pale'): StyleSpecification => ({
  version: 8,
  sources: {
    gsi: {
      type: 'raster',
      tiles: [TILE_URL[base]],
      tileSize: 256,
      maxzoom: 18,
      attribution: '<a href="https://maps.gsi.go.jp/development/ichiran.html" target="_blank">地理院タイル</a> | 3D都市モデル: <a href="https://www.mlit.go.jp/plateau/" target="_blank">PLATEAU</a>',
    },
  },
  layers: [{ id: 'gsi', type: 'raster', source: 'gsi' }],
});

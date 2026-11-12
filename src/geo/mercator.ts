/** Web Mercator helpers matching MapLibre's MercatorCoordinate (0..1 world square). */
export const EARTH_CIRCUMFERENCE = 2 * Math.PI * 6371008.8;

export type MercatorXY = { readonly x: number; readonly y: number };

export const mercatorXFromLng = (lng: number): number => (180 + lng) / 360;

export const mercatorYFromLat = (lat: number): number =>
  (180 - (180 / Math.PI) * Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360))) / 360;

export const lngLatToMercator = (lng: number, lat: number): MercatorXY => ({
  x: mercatorXFromLng(lng),
  y: mercatorYFromLat(lat),
});

export const lngFromMercatorX = (x: number): number => x * 360 - 180;

export const latFromMercatorY = (y: number): number => {
  const y2 = 180 - y * 360;
  return (360 / Math.PI) * Math.atan(Math.exp((y2 * Math.PI) / 180)) - 90;
};

/** Size of one meter, in mercator units, at the given latitude (same as MapLibre). */
export const meterInMercatorUnits = (lat: number): number =>
  1 / EARTH_CIRCUMFERENCE / Math.cos((lat * Math.PI) / 180);

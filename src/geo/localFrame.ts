/**
 * Local metric frame anchored at an origin (Tokyo Station by default).
 * x = east [m], y = north [m], z = up [m]. Horizontal axes are mercator-scaled meters,
 * so the frame maps onto MapLibre's mercator world with a single affine transform.
 */
import { type Mat4, multiply, scaling, translation } from './mat4';
import {
  latFromMercatorY,
  lngFromMercatorX,
  lngLatToMercator,
  meterInMercatorUnits,
} from './mercator';

export type LocalFrame = {
  readonly originLng: number;
  readonly originLat: number;
  readonly mercX: number;
  readonly mercY: number;
  /** mercator units per meter at the origin latitude */
  readonly scale: number;
};

export const TOKYO_STATION = { lng: 139.767125, lat: 35.681236 } as const;

export const createLocalFrame = (originLng: number, originLat: number): LocalFrame => {
  const m = lngLatToMercator(originLng, originLat);
  return { originLng, originLat, mercX: m.x, mercY: m.y, scale: meterInMercatorUnits(originLat) };
};

export const lngLatToLocal = (frame: LocalFrame, lng: number, lat: number): [number, number] => {
  const m = lngLatToMercator(lng, lat);
  return [(m.x - frame.mercX) / frame.scale, -(m.y - frame.mercY) / frame.scale];
};

export const localToLngLat = (frame: LocalFrame, x: number, y: number): [number, number] => [
  lngFromMercatorX(frame.mercX + x * frame.scale),
  latFromMercatorY(frame.mercY - y * frame.scale),
];

/** Matrix taking local meters to mercator units (z also in mercator units, as MapLibre expects). */
export const localToMercatorMatrix = (frame: LocalFrame): Mat4 =>
  multiply(translation(frame.mercX, frame.mercY, 0), scaling(frame.scale, -frame.scale, frame.scale));

/** local meters -> GL clip space, composed in float64 to keep precision. */
export const composeLocalToClip = (mercatorToClip: ArrayLike<number>, frame: LocalFrame): Mat4 =>
  multiply(mercatorToClip, localToMercatorMatrix(frame));

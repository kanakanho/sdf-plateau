/**
 * Solar position (NOAA / SunCalc style low-precision algorithm, ~0.1° accuracy).
 */
const RAD = Math.PI / 180;
const DAY_MS = 86400000;
const J1970 = 2440588;
const J2000 = 2451545;
const OBLIQUITY = RAD * 23.4397;

export type SunPosition = {
  /** radians, clockwise from north (0 = north, π/2 = east) */
  readonly azimuth: number;
  /** radians above the horizon */
  readonly altitude: number;
};

export const toDays = (date: Date): number => date.valueOf() / DAY_MS - 0.5 + J1970 - J2000;

export const solarMeanAnomaly = (d: number): number => RAD * (357.5291 + 0.98560028 * d);

export const eclipticLongitude = (M: number): number => {
  const C = RAD * (1.9148 * Math.sin(M) + 0.02 * Math.sin(2 * M) + 0.0003 * Math.sin(3 * M));
  const P = RAD * 102.9372;
  return M + C + P + Math.PI;
};

export const declination = (l: number): number => Math.asin(Math.sin(OBLIQUITY) * Math.sin(l));

export const rightAscension = (l: number): number =>
  Math.atan2(Math.sin(l) * Math.cos(OBLIQUITY), Math.cos(l));

export const siderealTime = (d: number, lngRad: number): number =>
  RAD * (280.16 + 360.9856235 * d) + lngRad;

export const sunPosition = (date: Date, lat: number, lng: number): SunPosition => {
  const lw = RAD * lng;
  const phi = RAD * lat;
  const d = toDays(date);
  const L = eclipticLongitude(solarMeanAnomaly(d));
  const dec = declination(L);
  const H = siderealTime(d, lw) - rightAscension(L);
  const altitude = Math.asin(Math.sin(phi) * Math.sin(dec) + Math.cos(phi) * Math.cos(dec) * Math.cos(H));
  // azimuth measured from south (SunCalc) -> convert to from-north clockwise
  const azFromSouth = Math.atan2(Math.sin(H), Math.cos(H) * Math.sin(phi) - Math.tan(dec) * Math.cos(phi));
  const azimuth = (azFromSouth + Math.PI) % (2 * Math.PI);
  return { azimuth, altitude };
};

/** Unit vector pointing towards the sun in the local ENU frame (x=east, y=north, z=up). */
export const sunDirectionENU = ({ azimuth, altitude }: SunPosition): [number, number, number] => [
  Math.sin(azimuth) * Math.cos(altitude),
  Math.cos(azimuth) * Math.cos(altitude),
  Math.sin(altitude),
];

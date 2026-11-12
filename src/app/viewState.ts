/** UI state and pure derivations used by the frame loop. */
import { type SunPosition, sunDirectionENU, sunPosition } from '../geo/sun';
import { type ColorModeCode, RenderFlag } from '../render/frame';

export type RenderMode = 'sdf' | 'raster';

export type ViewState = {
  readonly mode: RenderMode;
  readonly colorMode: ColorModeCode;
  readonly shadows: boolean;
  readonly ao: boolean;
  readonly refine: boolean;
  readonly groundShadows: boolean;
  readonly renderScale: number;
  /** click-to-pick buildings (off by default) */
  readonly picking: boolean;
  /** minutes since local midnight (JST) */
  readonly minutes: number;
  /** yyyy-mm-dd */
  readonly date: string;
  readonly selected: number;
};

/** 2026 June solstice (2026-06-21 08:24 UTC, i.e. June 21 in JST). */
export const SUMMER_SOLSTICE_2026 = '2026-06-21';

export const initialViewState: ViewState = {
  mode: 'sdf',
  colorMode: 0,
  shadows: true,
  ao: true,
  refine: false,
  groundShadows: true,
  renderScale: 0.75,
  picking: false,
  minutes: 14 * 60,
  date: SUMMER_SOLSTICE_2026,
  selected: 0,
};

/** Applies a UI patch; turning picking off also clears the selection. */
export const applyPatch = (s: ViewState, patch: Partial<ViewState>): ViewState => {
  const next = { ...s, ...patch };
  return next.picking ? next : { ...next, selected: 0 };
};

export const renderFlags = (s: Pick<ViewState, 'shadows' | 'ao' | 'refine' | 'groundShadows'>): number =>
  (s.shadows ? RenderFlag.Shadows : 0) |
  (s.ao ? RenderFlag.Ao : 0) |
  (s.refine ? RenderFlag.Refine : 0) |
  (s.groundShadows ? RenderFlag.Ground : 0);

/** Local JST date/time -> Date (UTC instant). */
export const jstDate = (date: string, minutes: number): Date => {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d, 0, minutes) - 9 * 3600 * 1000);
};

export const formatMinutes = (minutes: number): string =>
  `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;

/** Sun intensity fades in/out around sunrise/sunset. */
export const sunIntensity = (pos: SunPosition): number => {
  const s = Math.sin(pos.altitude);
  const t = Math.min(1, Math.max(0, (s + 0.02) / 0.12));
  return t * t * (3 - 2 * t);
};

export const sunLighting = (
  s: Pick<ViewState, 'date' | 'minutes'>,
  lat: number,
  lng: number,
): { dir: [number, number, number]; intensity: number } => {
  const pos = sunPosition(jstDate(s.date, s.minutes), lat, lng);
  return { dir: sunDirectionENU(pos), intensity: sunIntensity(pos) };
};

/** Backing-store size of the overlay canvas. */
export const canvasSize = (cssWidth: number, cssHeight: number, dpr: number, scale: number): [number, number] => [
  Math.max(1, Math.round(cssWidth * dpr * scale)),
  Math.max(1, Math.round(cssHeight * dpr * scale)),
];

/** `?refine=N` URL parameter (children per axis of refined bricks); defaults to 2, 1 disables. */
export const parseRefineFactor = (search: string, fallback = 2): number => {
  const v = Number(new URLSearchParams(search).get('refine'));
  return Number.isInteger(v) && v >= 1 && v <= 4 ? v : fallback;
};

export type DaylightRange = { readonly sunrise: number; readonly sunset: number };

/** First and last minute (JST) of the day with the sun above the horizon, or null (polar night). */
export const daylightRange = (date: string, lat: number, lng: number): DaylightRange | null => {
  let sunrise = -1;
  let sunset = -1;
  for (let m = 0; m < 1440; m++) {
    if (sunPosition(jstDate(date, m), lat, lng).altitude > 0) {
      if (sunrise < 0) sunrise = m;
      sunset = m;
    }
  }
  return sunrise < 0 ? null : { sunrise, sunset };
};

/** Next minute of a playback loop that only covers daylight: wraps from sunset back to sunrise. */
export const nextDaylightMinute = (current: number, step: number, range: DaylightRange): number => {
  if (current < range.sunrise || current >= range.sunset) return range.sunrise;
  return Math.min(current + step, range.sunset);
};

/** Clamps a time of day into the daylight range (unchanged when there is no daylight). */
export const clampToDaylight = (minutes: number, range: DaylightRange | null): number =>
  range ? Math.min(range.sunset, Math.max(range.sunrise, minutes)) : minutes;

/** DOM control panel wiring (side effects only). */
import type { BaseMap } from '../map/syncLayer';
import { type ColorModeCode } from '../render/frame';
import {
  type RenderMode,
  SUMMER_SOLSTICE_2026,
  type ViewState,
  clampToDaylight,
  daylightRange,
  formatMinutes,
  nextDaylightMinute,
} from './viewState';

const $ = <T extends HTMLElement>(id: string): T => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`#${id} not found`);
  return el as T;
};

export const setStatus = (text: string): void => {
  const el = document.getElementById('status');
  if (el) el.textContent = text;
};

/** × hides the whole panel; the floating ☰ button brings it back. */
export const bindPanelToggle = (): void => {
  const setHidden = (hidden: boolean) => document.body.classList.toggle('panel-hidden', hidden);
  $<HTMLButtonElement>('panel-hide').onclick = () => setHidden(true);
  $<HTMLButtonElement>('panel-show').onclick = () => setHidden(false);
};

export const bindControls = (
  initial: ViewState,
  update: (patch: Partial<ViewState>) => void,
  setBaseMap: (base: BaseMap) => void,
  afterStyleChange: () => void,
  origin: { readonly lat: number; readonly lng: number },
): void => {
  const mode = $<HTMLSelectElement>('mode');
  const color = $<HTMLSelectElement>('color');
  const scale = $<HTMLInputElement>('scale');
  const scaleLabel = $<HTMLSpanElement>('scale-label');
  const date = $<HTMLInputElement>('date');
  const time = $<HTMLInputElement>('time');
  const timeLabel = $<HTMLSpanElement>('time-label');
  const play = $<HTMLButtonElement>('play');
  const base = $<HTMLSelectElement>('base');

  mode.value = initial.mode;
  color.value = String(initial.colorMode);
  scale.value = String(initial.renderScale);
  scaleLabel.textContent = `${Math.round(initial.renderScale * 100)}%`;
  date.value = initial.date;
  time.value = String(initial.minutes);
  timeLabel.textContent = formatMinutes(initial.minutes);

  mode.onchange = () => update({ mode: mode.value as RenderMode });
  color.onchange = () => update({ colorMode: Number(color.value) as ColorModeCode });
  scale.oninput = () => {
    scaleLabel.textContent = `${Math.round(Number(scale.value) * 100)}%`;
    update({ renderScale: Number(scale.value) });
  };
  time.oninput = () => {
    timeLabel.textContent = formatMinutes(Number(time.value));
    update({ minutes: Number(time.value) });
  };
  for (const key of ['shadows', 'ao', 'refine', 'groundShadows', 'picking'] as const) {
    const box = $<HTMLInputElement>(key);
    box.checked = initial[key];
    box.onchange = () => update({ [key]: box.checked });
  }
  base.onchange = () => {
    setBaseMap(base.value as BaseMap);
    afterStyleChange();
  };

  const setMinutes = (m: number) => {
    time.value = String(m);
    timeLabel.textContent = formatMinutes(m);
    update({ minutes: m });
  };
  // the time slider only spans the hours the sun is above the horizon on the selected date
  let range = daylightRange(date.value, origin.lat, origin.lng);
  const applyDate = (d: string) => {
    range = daylightRange(d, origin.lat, origin.lng);
    time.min = String(range?.sunrise ?? 0);
    time.max = String(range?.sunset ?? 1439);
    update({ date: d });
    setMinutes(clampToDaylight(Number(time.value), range));
  };
  applyDate(date.value);
  date.onchange = () => applyDate(date.value);

  // ▶ plays the 2026 summer solstice, looping from sunrise to sunset
  let playing = false;
  const tick = () => {
    if (!playing || !range) return;
    setMinutes(nextDaylightMinute(Number(time.value), 2, range));
    requestAnimationFrame(tick);
  };
  play.title = '2026年の夏至・日の出から日の入りまでをループ再生';
  play.onclick = () => {
    if (!playing && date.value !== SUMMER_SOLSTICE_2026) {
      date.value = SUMMER_SOLSTICE_2026;
      applyDate(SUMMER_SOLSTICE_2026);
    }
    playing = !playing && range !== null;
    play.textContent = playing ? '⏸' : '▶';
    if (playing) requestAnimationFrame(tick);
  };
};

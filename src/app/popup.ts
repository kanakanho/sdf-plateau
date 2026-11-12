/** Building info popup content (pure string building, HTML-escaped). */
import { type BuildingAttributes, usageLabel } from '../data/buildings';

export const escapeHtml = (s: string): string =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

export const buildingRows = (b: BuildingAttributes): [string, string][] => {
  const rows: [string, string][] = [];
  if (b.name) rows.push(['名称', b.name]);
  rows.push(['用途', usageLabel(b.usage)]);
  if (b.measuredHeight !== undefined) rows.push(['計測高さ', `${b.measuredHeight.toFixed(1)} m`]);
  if (b.storeysAboveGround !== undefined) rows.push(['地上階数', `${b.storeysAboveGround} 階`]);
  if (b.yearOfConstruction !== undefined) rows.push(['建築年', `${b.yearOfConstruction} 年`]);
  if (b.address) rows.push(['所在地', b.address]);
  rows.push(['LOD', String(b.lod)]);
  if (b.buildingId) rows.push(['建物ID', b.buildingId]);
  return rows;
};

export const buildingPopupHtml = (b: BuildingAttributes): string =>
  `<table class="bldg">${buildingRows(b)
    .map(([k, v]) => `<tr><th>${escapeHtml(k)}</th><td>${escapeHtml(v)}</td></tr>`)
    .join('')}</table>`;

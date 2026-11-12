import { describe, expect, it } from 'vitest';
import { buildingPopupHtml, buildingRows, escapeHtml } from './popup';

describe('escapeHtml', () => {
  it('escapes markup characters', () => {
    expect(escapeHtml(`<a href="x">'&'</a>`)).toBe('&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;');
  });
});

describe('buildingRows', () => {
  it('lists available attributes in order', () => {
    const rows = buildingRows({ gmlId: 'g', lod: 2, groundElevation: 0, name: '東京駅', usage: '431', measuredHeight: 33.2, yearOfConstruction: 1914 });
    expect(rows).toEqual([
      ['名称', '東京駅'],
      ['用途', '運輸倉庫施設'],
      ['計測高さ', '33.2 m'],
      ['建築年', '1914 年'],
      ['LOD', '2'],
    ]);
  });
  it('shows unknown usage for minimal records', () => {
    expect(buildingRows({ gmlId: 'g', lod: 1, groundElevation: 0 })).toEqual([
      ['用途', '不明'],
      ['LOD', '1'],
    ]);
  });
});

describe('buildingPopupHtml', () => {
  it('renders an escaped table', () => {
    const html = buildingPopupHtml({ gmlId: 'g', lod: 2, groundElevation: 0, name: '<b>' });
    expect(html).toContain('<table class="bldg">');
    expect(html).toContain('&lt;b&gt;');
  });
});

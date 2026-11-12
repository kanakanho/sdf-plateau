import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  BUNDLED_PACKAGES,
  LICENSES_FILE,
  findLicenseFile,
  formatThirdPartyLicenses,
  readPackageLicense,
  thirdPartyLicenses,
} from './licenses';

const nodeModules = join(process.cwd(), 'node_modules');

describe('findLicenseFile', () => {
  it('finds common license file names', () => {
    expect(findLicenseFile(['package.json', 'LICENSE.txt', 'README.md'])).toBe('LICENSE.txt');
    expect(findLicenseFile(['LICENSE'])).toBe('LICENSE');
    expect(findLicenseFile(['license.md'])).toBe('license.md');
    expect(findLicenseFile(['README.md'])).toBeUndefined();
  });
});

describe('formatThirdPartyLicenses', () => {
  it('lists each package with name, version, license and text', () => {
    const out = formatThirdPartyLicenses([{ name: 'a', version: '1.0.0', license: 'MIT', text: '  MIT text  \n' }]);
    expect(out).toContain('a 1.0.0 (MIT)');
    expect(out).toContain('MIT text');
    expect(out.startsWith('This application bundles')).toBe(true);
  });
});

describe('readPackageLicense', () => {
  it('reads the MapLibre license (BSD-3-Clause)', () => {
    const e = readPackageLicense(nodeModules, 'maplibre-gl');
    expect(e.license).toBe('BSD-3-Clause');
    expect(e.text).toContain('MapLibre contributors');
  });
  it('throws for packages without a license file', () => {
    const root = mkdtempSync(join(tmpdir(), 'licenses-test-'));
    mkdirSync(join(root, 'nolicense'));
    writeFileSync(join(root, 'nolicense', 'package.json'), JSON.stringify({ version: '1.0.0' }));
    expect(() => readPackageLicense(root, 'nolicense')).toThrow(/no license file/);
  });
});

describe('thirdPartyLicenses plugin', () => {
  it('emits the notices file at build time', () => {
    const plugin = thirdPartyLicenses(BUNDLED_PACKAGES, nodeModules);
    expect(plugin.apply).toBe('build');
    const emitted: { fileName: string; source: string }[] = [];
    const ctx = { emitFile: (f: { fileName: string; source: string }) => emitted.push(f) };
    (plugin.generateBundle as unknown as (this: typeof ctx) => void).call(ctx);
    expect(emitted[0].fileName).toBe(LICENSES_FILE);
    expect(emitted[0].source).toContain('maplibre-gl');
    expect(emitted[0].source).toContain('vite');
  });
});

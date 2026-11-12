/**
 * Third-party license notices for the production build.
 * Minification strips license comments from the main bundle, so the build emits
 * THIRD_PARTY_LICENSES.txt with the full license texts of the bundled packages
 * (BSD-3-Clause and MIT require the notice to accompany redistributed binaries).
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import type { Plugin } from 'vite';

export type LicenseEntry = {
  readonly name: string;
  readonly version: string;
  readonly license: string;
  readonly text: string;
};

export const LICENSES_FILE = 'THIRD_PARTY_LICENSES.txt';

/** Third-party code that ends up in the browser bundle. */
export const BUNDLED_PACKAGES = ['maplibre-gl', 'vite'] as const;

export const formatThirdPartyLicenses = (entries: readonly LicenseEntry[]): string =>
  [
    'This application bundles the following third-party software.',
    '',
    ...entries.flatMap((e) => ['='.repeat(72), `${e.name} ${e.version} (${e.license})`, '='.repeat(72), '', e.text.trim(), '']),
  ].join('\n');

/** Picks the license file name from a package directory listing. */
export const findLicenseFile = (files: readonly string[]): string | undefined =>
  files.find((f) => /^(license|licence|copying)(\.(md|txt))?$/i.test(f));

export const readPackageLicense = (nodeModules: string, name: string): LicenseEntry => {
  const dir = join(nodeModules, name);
  const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')) as { version: string; license?: string };
  const file = findLicenseFile(readdirSync(dir));
  if (!file) throw new Error(`no license file found for ${name}`);
  return { name, version: pkg.version, license: pkg.license ?? 'UNKNOWN', text: readFileSync(join(dir, file), 'utf8') };
};

/** Vite plugin: emits THIRD_PARTY_LICENSES.txt into the build output. */
export const thirdPartyLicenses = (
  packages: readonly string[] = BUNDLED_PACKAGES,
  nodeModules = join(process.cwd(), 'node_modules'),
): Plugin => ({
  name: 'third-party-licenses',
  apply: 'build',
  generateBundle() {
    const source = formatThirdPartyLicenses(packages.map((p) => readPackageLicense(nodeModules, p)));
    this.emitFile({ type: 'asset', fileName: LICENSES_FILE, source });
  },
});

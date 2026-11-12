/**
 * Loads the preprocessed city: gzip-compressed binary mesh (city.bin.gz, kept under hosting
 * per-file limits such as Cloudflare's 25 MiB) + attribute JSON.
 */
import type { CityMeta } from './buildings';
import { maybeGunzip } from './gzip';
import { type CityMesh, decodeCityMesh } from './meshFormat';

export type City = { readonly mesh: CityMesh; readonly meta: CityMeta };

export const loadCity = async (baseUrl: string, fetcher: typeof fetch = fetch): Promise<City> => {
  const [bin, json] = await Promise.all([fetcher(`${baseUrl}/city.bin.gz`), fetcher(`${baseUrl}/city.json`)]);
  if (!bin.ok || !json.ok) throw new Error(`failed to load city data from ${baseUrl} (run pnpm preprocess)`);
  const [buf, meta] = await Promise.all([bin.arrayBuffer(), json.json() as Promise<CityMeta>]);
  return { mesh: decodeCityMesh(await maybeGunzip(buf)), meta };
};

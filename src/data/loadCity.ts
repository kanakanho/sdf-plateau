/** Loads the preprocessed city (binary mesh + attribute JSON). */
import type { CityMeta } from './buildings';
import { type CityMesh, decodeCityMesh } from './meshFormat';

export type City = { readonly mesh: CityMesh; readonly meta: CityMeta };

export const loadCity = async (baseUrl: string, fetcher: typeof fetch = fetch): Promise<City> => {
  const [bin, json] = await Promise.all([fetcher(`${baseUrl}/city.bin`), fetcher(`${baseUrl}/city.json`)]);
  if (!bin.ok || !json.ok) throw new Error(`failed to load city data from ${baseUrl} (run npm run preprocess)`);
  const [buf, meta] = await Promise.all([bin.arrayBuffer(), json.json() as Promise<CityMeta>]);
  return { mesh: decodeCityMesh(buf), meta };
};

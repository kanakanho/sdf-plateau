import { describe, expect, it } from 'vitest';
import { gunzip, gzip, isGzip, maybeGunzip } from './gzip';

const sample = Uint8Array.from({ length: 5000 }, (_, i) => (i * 7) % 251).buffer;

describe('isGzip', () => {
  it('detects the gzip magic bytes', async () => {
    expect(isGzip(await gzip(sample))).toBe(true);
    expect(isGzip(sample)).toBe(false);
    expect(isGzip(new ArrayBuffer(1))).toBe(false);
  });
});

describe('gzip / gunzip', () => {
  it('round-trips data', async () => {
    const back = await gunzip(await gzip(sample));
    expect(new Uint8Array(back)).toEqual(new Uint8Array(sample));
  });
});

describe('maybeGunzip', () => {
  it('decompresses gzip input', async () => {
    expect(new Uint8Array(await maybeGunzip(await gzip(sample)))).toEqual(new Uint8Array(sample));
  });
  it('passes already-decoded data through unchanged', async () => {
    expect(await maybeGunzip(sample)).toBe(sample);
  });
});

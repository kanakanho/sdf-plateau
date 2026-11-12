/** Pixel comparison of building-id images (0 = background). */
export type IdImageDiff = {
  readonly mismatchFraction: number;
  readonly coverageA: number;
  readonly coverageB: number;
  readonly mismatched: number;
};

export const compareIdImages = (a: Uint32Array, b: Uint32Array): IdImageDiff => {
  if (a.length !== b.length) throw new Error('image size mismatch');
  let mismatched = 0;
  let ca = 0;
  let cb = 0;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) mismatched++;
    if (a[i]) ca++;
    if (b[i]) cb++;
  }
  const n = Math.max(1, a.length);
  return { mismatchFraction: mismatched / n, coverageA: ca / n, coverageB: cb / n, mismatched };
};

/** Mismatches that are not adjacent to an edge of image `a` (interior errors are real bugs). */
export const interiorMismatches = (a: Uint32Array, b: Uint32Array, width: number): number => {
  const height = a.length / width;
  let count = 0;
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const i = y * width + x;
      if (a[i] === b[i]) continue;
      const v = a[i];
      if (a[i - 1] === v && a[i + 1] === v && a[i - width] === v && a[i + width] === v) count++;
    }
  }
  return count;
};

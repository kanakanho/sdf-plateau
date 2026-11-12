/** Procedural test meshes (outward-facing, counter-clockwise when seen from outside). */

/** Axis-aligned box as 12 triangles, 9 floats each. */
export const boxTriangles = (
  min: readonly [number, number, number],
  max: readonly [number, number, number],
): Float32Array => {
  const [x0, y0, z0] = min;
  const [x1, y1, z1] = max;
  const v = [
    [x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0],
    [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1],
  ];
  // quads with outward CCW winding
  const quads = [
    [0, 3, 2, 1], // bottom (-z)
    [4, 5, 6, 7], // top (+z)
    [0, 1, 5, 4], // -y
    [2, 3, 7, 6], // +y
    [1, 2, 6, 5], // +x
    [3, 0, 4, 7], // -x
  ];
  const out: number[] = [];
  for (const [a, b, c, d] of quads) {
    out.push(...v[a], ...v[b], ...v[c], ...v[a], ...v[c], ...v[d]);
  }
  return Float32Array.from(out);
};

/**
 * Gable-roof house: footprint [x0,x1]×[y0,y1], eaves at `eave`, ridge (along x, at mid y) at `ridge`.
 * Outward CCW triangles, 9 floats each.
 */
export const gableTriangles = (
  x0: number, y0: number, x1: number, y1: number, eave: number, ridge: number,
): Float32Array => {
  const ym = (y0 + y1) / 2;
  const tri = (out: number[], ...v: number[][]) => out.push(...v[0], ...v[1], ...v[2]);
  const out: number[] = [];
  const quad = (a: number[], b: number[], c: number[], d: number[]) => {
    tri(out, a, b, c);
    tri(out, a, c, d);
  };
  // bottom (-z)
  quad([x0, y0, 0], [x0, y1, 0], [x1, y1, 0], [x1, y0, 0]);
  // side walls
  quad([x0, y0, 0], [x1, y0, 0], [x1, y0, eave], [x0, y0, eave]); // -y
  quad([x1, y1, 0], [x0, y1, 0], [x0, y1, eave], [x1, y1, eave]); // +y
  // gable ends (pentagons) as wall quad + triangle
  quad([x1, y0, 0], [x1, y1, 0], [x1, y1, eave], [x1, y0, eave]); // +x
  tri(out, [x1, y0, eave], [x1, y1, eave], [x1, ym, ridge]);
  quad([x0, y1, 0], [x0, y0, 0], [x0, y0, eave], [x0, y1, eave]); // -x
  tri(out, [x0, y1, eave], [x0, y0, eave], [x0, ym, ridge]);
  // roof slopes
  quad([x0, y0, eave], [x1, y0, eave], [x1, ym, ridge], [x0, ym, ridge]);
  quad([x1, y1, eave], [x0, y1, eave], [x0, ym, ridge], [x1, ym, ridge]);
  return Float32Array.from(out);
};

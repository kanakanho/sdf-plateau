import { describe, expect, it } from 'vitest';
import { boxTriangles } from '../geom/boxMesh';
import { binTriangles } from './binning';
import { computeGridSpec } from './gridSpec';
import { BRICK_EMPTY_FLAG, buildIndirection, decodeIndirection } from './indirection';
import { BRICK_REFINED_FLAG, assembleAdaptive, binChild, childMin, childrenOf, planRefinement, slotScores } from './refine';

// two boxes: a big plain one and a cluster of small "rooftop equipment" boxes
const big = boxTriangles([2, 2, 0], [14, 14, 10]);
const small = [0, 1, 2, 3].map((i) => boxTriangles([20 + i * 1.5, 4, 0], [20.6 + i * 1.5, 4.6, 0.6]));
const positions = Float32Array.from([...big, ...small.flatMap((b) => Array.from(b))]);
const spec = computeGridSpec([0, 0, 0], [30, 16, 12], { voxelSize: 1 });
const bins = binTriangles(positions, spec);

describe('slotScores', () => {
  it('counts binned triangles per slot', () => {
    const s = slotScores(bins);
    expect(s).toHaveLength(bins.slotBricks.length);
    expect(Array.from(s)).toEqual(Array.from({ length: s.length }, (_, i) => bins.triOffsets[i + 1] - bins.triOffsets[i]));
  });
});

describe('childMin', () => {
  it('orders children x-fastest', () => {
    expect(childMin([0, 0, 0], 4, 2, 0)).toEqual([0, 0, 0]);
    expect(childMin([0, 0, 0], 4, 2, 1)).toEqual([4, 0, 0]);
    expect(childMin([0, 0, 0], 4, 2, 2)).toEqual([0, 4, 0]);
    expect(childMin([10, 0, 0], 4, 2, 7)).toEqual([14, 4, 4]);
  });
});

describe('binChild', () => {
  const tri = new Float32Array([1, 1, 1, 2, 1, 1, 1, 2, 1]);
  it('lists and occupies children touched by a triangle', () => {
    expect(binChild(tri, [0], [0, 0, 0], 4, 2, 0.5)).toEqual({ occupied: true, list: [0] });
  });
  it('lists but does not occupy children only within the truncation band', () => {
    expect(binChild(tri, [0], [3.5, 0, 0], 4, 2, 0.5)).toEqual({ occupied: false, list: [0] });
  });
  it('ignores far triangles', () => {
    expect(binChild(tri, [0], [10, 10, 10], 4, 2, 0.5)).toEqual({ occupied: false, list: [] });
  });
});

describe('childrenOf', () => {
  it('returns R³ children with lists drawn from the parent list', () => {
    const children = childrenOf(positions, bins, spec, 0, 2);
    expect(children).toHaveLength(8);
    const parent = new Set(bins.triIndices.subarray(bins.triOffsets[0], bins.triOffsets[1]));
    for (const c of children) for (const t of c.list) expect(parent.has(t)).toBe(true);
  });
});

describe('planRefinement', () => {
  it('prefers the most detailed bricks and respects the slot budget', () => {
    const n = bins.slotBricks.length;
    const plan = planRefinement(positions, bins, spec, 2, n + 6, 0);
    const scores = slotScores(bins);
    const refined = [...plan.keys()];
    expect(refined.length).toBeGreaterThan(0);
    const added = [...plan.values()].reduce((s, ch) => s + ch.filter((c) => c.occupied).length - 1, 0);
    expect(n + added).toBeLessThanOrEqual(n + 6);
    const maxScore = Math.max(...scores);
    expect(refined.some((s) => scores[s] === maxScore)).toBe(true);
  });
  it('refines nothing below the minimum score', () => {
    expect(planRefinement(positions, bins, spec, 2, 1e6, 1e9).size).toBe(0);
  });
});

describe('assembleAdaptive', () => {
  const coarseTable = buildIndirection(spec, bins.slotBricks);
  const plan = planRefinement(positions, bins, spec, 2, 1e6, 20);
  const a = assembleAdaptive(spec, bins, coarseTable, plan, 2);

  it('replaces refined bricks with their occupied children', () => {
    const occupiedChildren = [...plan.values()].reduce((s, ch) => s + ch.filter((c) => c.occupied).length, 0);
    expect(a.bins.slotBricks.length).toBe(bins.slotBricks.length - plan.size + occupiedChildren);
    expect(a.refinedBricks).toBe(plan.size);
    expect(a.slotDescs).toHaveLength(a.bins.slotBricks.length * 4);
  });
  it('writes a two-level table: refined entries point at R³ child entries', () => {
    const coarseCells = coarseTable.length;
    expect(a.brickTable.length).toBe(coarseCells + plan.size * 8);
    let refinedSeen = 0;
    for (let i = 0; i < coarseCells; i++) {
      const e = a.brickTable[i];
      if ((e & BRICK_EMPTY_FLAG) === 0 && (e & BRICK_REFINED_FLAG) !== 0) {
        refinedSeen++;
        const base = e & ~BRICK_REFINED_FLAG;
        expect(base).toBeGreaterThanOrEqual(coarseCells);
        for (let k = 0; k < 8; k++) {
          const ce = decodeIndirection(a.brickTable[base + k]);
          if (!ce.empty) {
            expect(a.slotDescs[ce.value * 4 + 3]).toBe(0.5);
          } else {
            expect(ce.value).toBe(1);
          }
        }
      }
    }
    expect(refinedSeen).toBe(plan.size);
  });
  it('keeps coarse slots at full voxel size with their original lists', () => {
    const coarse = Array.from({ length: a.bins.slotBricks.length }, (_, s) => s).filter((s) => a.slotDescs[s * 4 + 3] === 1);
    expect(coarse.length).toBe(bins.slotBricks.length - plan.size);
    expect(a.bins.triOffsets[a.bins.triOffsets.length - 1]).toBe(a.bins.triIndices.length);
  });
});

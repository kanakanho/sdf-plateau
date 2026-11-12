import { describe, expect, it } from 'vitest';
import { defineModule, linkWgsl, type WgslModule } from './link';

describe('defineModule', () => {
  it('creates a module record', () => {
    const m = defineModule('a', 'fn a() {}');
    expect(m).toEqual({ name: 'a', code: 'fn a() {}', deps: [] });
  });
});

describe('linkWgsl', () => {
  it('emits dependencies before dependents, once', () => {
    const a = defineModule('a', 'A');
    const b = defineModule('b', 'B', [a]);
    const c = defineModule('c', 'C', [a, b]);
    const src = linkWgsl(c, b);
    const order = ['A', 'B', 'C'].map((x) => src.indexOf(`\n${x}`));
    expect(order[0]).toBeLessThan(order[1]);
    expect(order[1]).toBeLessThan(order[2]);
    expect(src.match(/\nA/g)).toHaveLength(1);
  });
  it('detects cycles', () => {
    const a: { name: string; code: string; deps: WgslModule[] } = { name: 'a', code: '', deps: [] };
    const b = defineModule('b', '', [a]);
    a.deps.push(b);
    expect(() => linkWgsl(a)).toThrow(/cyclic/);
  });
});

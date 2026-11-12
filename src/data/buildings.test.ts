import { describe, expect, it } from 'vitest';
import { usageCategory, usageLabel } from './buildings';

describe('usageLabel', () => {
  it('maps known codes', () => {
    expect(usageLabel('401')).toBe('業務施設');
  });
  it('labels unknown codes and missing values', () => {
    expect(usageLabel('999')).toBe('コード 999');
    expect(usageLabel(undefined)).toBe('不明');
  });
});

describe('usageCategory', () => {
  it('groups codes into colour categories', () => {
    expect(usageCategory('401')).toBe(1);
    expect(usageCategory('404')).toBe(2);
    expect(usageCategory('403')).toBe(3);
    expect(usageCategory('412')).toBe(4);
    expect(usageCategory('422')).toBe(5);
    expect(usageCategory('431')).toBe(6);
    expect(usageCategory(undefined)).toBe(0);
  });
});

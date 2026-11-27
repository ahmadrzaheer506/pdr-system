import { describe, it, expect } from 'vitest';
import { parseDecimalInput, decimalFieldValue, coerceDecimal } from './numberInput.js';

describe('parseDecimalInput', () => {
  it('clears an empty field instead of snapping back to 0', () => {
    expect(parseDecimalInput('')).toBe('');
    expect(parseDecimalInput('   ')).toBe('');
  });

  it('drops a leading zero when more digits are typed', () => {
    expect(parseDecimalInput('0')).toBe(0);
    expect(parseDecimalInput('03')).toBe(3);
    expect(parseDecimalInput('034')).toBe(34);
  });

  it('keeps a trailing decimal while typing pence', () => {
    expect(parseDecimalInput('.')).toBe('0.');
    expect(parseDecimalInput('0.')).toBe('0.');
    expect(parseDecimalInput('0.5')).toBe(0.5);
    expect(parseDecimalInput('12.99')).toBe(12.99);
  });

  it('caps fractional digits', () => {
    expect(parseDecimalInput('1.239', { maxDecimals: 2 })).toBe(1.23);
  });
});

describe('decimalFieldValue / coerceDecimal', () => {
  it('renders empty and in-progress dots as typed', () => {
    expect(decimalFieldValue('')).toBe('');
    expect(decimalFieldValue('0.')).toBe('0.');
    expect(decimalFieldValue(42)).toBe('42');
  });

  it('coerces empty and in-progress values to 0 for save/totals', () => {
    expect(coerceDecimal('')).toBe(0);
    expect(coerceDecimal('0.')).toBe(0);
    expect(coerceDecimal(12.5)).toBe(12.5);
  });
});

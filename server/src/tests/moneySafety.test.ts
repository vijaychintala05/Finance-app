import { describe, expect, it } from 'vitest';
import { centsToSafeNumber, databaseMoney, databaseMoneyToCents, moneyInputToCents } from '../utils/money';

describe('database money safety', () => {
  it('parses PostgreSQL decimal strings into exact cents', () => {
    expect(databaseMoneyToCents('123456789.09', 'amount')).toBe(12345678909n);
    expect(databaseMoney('-0.01', 'amount')).toBe(-0.01);
    expect(databaseMoney('12.3', 'amount')).toBe(12.3);
  });

  it('accepts database scale padding but rejects non-zero sub-cent precision', () => {
    expect(databaseMoneyToCents('7.2300', 'amount')).toBe(723n);
    expect(() => databaseMoneyToCents('7.2301', 'amount')).toThrow('precision smaller than one cent');
  });

  it('fails closed before exact cents would be lost in a JavaScript number', () => {
    expect(centsToSafeNumber(BigInt(Number.MAX_SAFE_INTEGER), 'amount')).toBe(Number.MAX_SAFE_INTEGER / 100);
    expect(() => centsToSafeNumber(BigInt(Number.MAX_SAFE_INTEGER) + 1n, 'amount')).toThrow('exact monetary range');
  });

  it('converts API money inputs to exact cents before aggregation', () => {
    expect(moneyInputToCents(999999999999.99, 'amount')).toBe(99999999999999n);
    expect(moneyInputToCents('0.01', 'amount')).toBe(1n);
    expect(() => moneyInputToCents(1.001, 'amount')).toThrow('fractions smaller than one cent');
  });
});

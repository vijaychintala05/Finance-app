const MAX_SAFE_CENTS = BigInt(Number.MAX_SAFE_INTEGER);

export function moneyInputToCents(value: unknown, field: string): bigint {
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error(`${field} must be a finite monetary amount`);
    const scaled = value * 100;
    const rounded = Math.round(scaled);
    if (!Number.isSafeInteger(rounded)) {
      throw new Error(`${field} exceeds the exact monetary range supported by this API`);
    }
    if (Math.abs(scaled - rounded) > 1e-7) {
      throw new Error(`${field} cannot contain fractions smaller than one cent`);
    }
    return BigInt(rounded);
  }

  return databaseMoneyToCents(value, field);
}

export function databaseMoneyToCents(value: unknown, field: string): bigint {
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error(`${field} must be a finite monetary amount`);
    const scaled = value * 100;
    const rounded = Math.round(scaled);
    if (!Number.isSafeInteger(rounded)) {
      throw new Error(`${field} exceeds the exact monetary range supported by this API`);
    }
    if (Math.abs(scaled - rounded) > 1e-5) {
      throw new Error(`${field} contains precision smaller than one cent`);
    }
    return BigInt(rounded);
  }

  const raw = String(value ?? '0').trim();
  const match = raw.match(/^(-?)(\d+)(?:\.(\d+))?$/);
  if (!match) throw new Error(`${field} is not a valid database monetary value`);
  const fraction = match[3] || '';
  if (fraction.length > 2 && /[1-9]/.test(fraction.slice(2))) {
    const num = Number(raw);
    if (Number.isFinite(num)) {
      const scaled = num * 100;
      const rounded = Math.round(scaled);
      if (Math.abs(scaled - rounded) <= 1e-5) {
        return BigInt(rounded);
      }
    }
    throw new Error(`${field} contains precision smaller than one cent`);
  }
  const cents = BigInt(match[2]) * 100n + BigInt((fraction.slice(0, 2) || '').padEnd(2, '0') || '0');
  return match[1] === '-' ? -cents : cents;
}

export function centsToSafeNumber(cents: bigint, field: string): number {
  if (cents > MAX_SAFE_CENTS || cents < -MAX_SAFE_CENTS) {
    throw new Error(`${field} exceeds the exact monetary range supported by this API`);
  }
  return Number(cents) / 100;
}

export function databaseMoney(value: unknown, field: string): number {
  return centsToSafeNumber(databaseMoneyToCents(value, field), field);
}

/**
 * Deterministic Indian Numbering System formatting (ones, tens, hundreds, thousands, lakhs, crores)
 */
export function formatIndianNumber(amount: number | string, decimals: number = 2): string {
  const num = typeof amount === 'number' ? amount : parseFloat(String(amount ?? 0));
  const safeNum = Number.isFinite(num) ? num : 0;
  const isNegative = safeNum < 0;
  const fixed = Math.abs(safeNum).toFixed(decimals);
  const [intPart, decPart] = fixed.split('.');

  let formattedInteger: string;
  if (intPart.length <= 3) {
    formattedInteger = intPart;
  } else {
    const lastThree = intPart.slice(-3);
    const otherNumbers = intPart.slice(0, -3);
    const formattedOther = otherNumbers.replace(/\B(?=(\d{2})+(?!\d))/g, ',');
    formattedInteger = `${formattedOther},${lastThree}`;
  }

  const decimalString = decimals > 0 ? `.${decPart}` : '';
  return `${isNegative ? '-' : ''}${formattedInteger}${decimalString}`;
}

const FOREIGN_CURRENCIES = /^(USD|\$|EUR|€|GBP|£|CAD|C\$|AUD|A\$|SGD|S\$|AED|JPY|¥|CHF|NZD)$/i;

export function formatCurrencyAmount(amount: number, symbol: string = ''): string {
  const safeAmount = Number.isFinite(amount) ? amount : 0;
  const cleanSymbol = symbol.trim();
  const isForeign = FOREIGN_CURRENCIES.test(cleanSymbol);
  const formatted = isForeign
    ? Math.abs(safeAmount).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : formatIndianNumber(Math.abs(safeAmount), 2);
  const separator = /^[A-Za-z]{2,4}\.?$/i.test(cleanSymbol) ? ' ' : '';
  const prefix = cleanSymbol ? `${cleanSymbol}${separator}` : '';
  return `${safeAmount < 0 ? '-' : ''}${prefix}${formatted}`;
}

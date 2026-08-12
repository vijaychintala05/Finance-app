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
  const raw = String(value ?? '0').trim();
  const match = raw.match(/^(-?)(\d+)(?:\.(\d+))?$/);
  if (!match) throw new Error(`${field} is not a valid database monetary value`);
  const fraction = match[3] || '';
  if (fraction.length > 2 && /[1-9]/.test(fraction.slice(2))) {
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

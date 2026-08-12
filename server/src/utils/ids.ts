import crypto from 'crypto';

export function newId(prefix: string): string {
  return `${prefix}-${crypto.randomUUID()}`;
}

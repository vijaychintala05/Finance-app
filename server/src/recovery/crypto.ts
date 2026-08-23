import crypto from 'node:crypto';
import { RecoveryError } from './errors';
import type { RecoveryEnvelope, RecoveryKeyring, RecoveryManifest, RecoveryPayload } from './types';

export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (value instanceof Date) return JSON.stringify(value.toISOString());
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(',')}}`;
}

function getKey(keys: Record<string, Buffer>, keyId: string, purpose: string): Buffer {
  const key = keys[keyId];
  if (!key || key.length !== 32) {
    throw new RecoveryError('RECOVERY_CONFIGURATION_INVALID', `${purpose} key [${keyId}] must be exactly 32 bytes`, 500);
  }
  return key;
}

function signedContent(envelope: Omit<RecoveryEnvelope, 'hmac'>): string {
  return canonicalJson(envelope);
}

export function sealRecoveryPayload(manifest: RecoveryManifest, payload: RecoveryPayload, keyring: RecoveryKeyring): RecoveryEnvelope {
  const encryptionKey = getKey(keyring.encryptionKeys, manifest.keyId, 'Encryption');
  const hmacKey = getKey(keyring.hmacKeys, manifest.keyId, 'HMAC');
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey, iv);
  cipher.setAAD(Buffer.from(canonicalJson(manifest)));
  const ciphertext = Buffer.concat([cipher.update(canonicalJson(payload), 'utf8'), cipher.final()]);
  const unsigned = {
    manifest,
    iv: iv.toString('base64'),
    authTag: cipher.getAuthTag().toString('base64'),
    ciphertext: ciphertext.toString('base64'),
  };
  return {
    ...unsigned,
    hmac: crypto.createHmac('sha256', hmacKey).update(signedContent(unsigned)).digest('base64'),
  };
}

export function openRecoveryPayload(envelope: RecoveryEnvelope, keyring: RecoveryKeyring): RecoveryPayload {
  const { manifest } = envelope;
  const encryptionKey = getKey(keyring.encryptionKeys, manifest.keyId, 'Encryption');
  const hmacKey = getKey(keyring.hmacKeys, manifest.keyId, 'HMAC');
  const unsigned = { manifest, iv: envelope.iv, authTag: envelope.authTag, ciphertext: envelope.ciphertext };
  const expected = crypto.createHmac('sha256', hmacKey).update(signedContent(unsigned)).digest();
  const received = Buffer.from(envelope.hmac, 'base64');
  if (expected.length !== received.length || !crypto.timingSafeEqual(expected, received)) {
    throw new RecoveryError('RECOVERY_INTEGRITY_FAILED', 'Recovery artifact integrity validation failed', 422);
  }
  try {
    const decipher = crypto.createDecipheriv('aes-256-gcm', encryptionKey, Buffer.from(envelope.iv, 'base64'));
    decipher.setAAD(Buffer.from(canonicalJson(manifest)));
    decipher.setAuthTag(Buffer.from(envelope.authTag, 'base64'));
    const plaintext = Buffer.concat([
      decipher.update(Buffer.from(envelope.ciphertext, 'base64')),
      decipher.final(),
    ]).toString('utf8');
    return JSON.parse(plaintext) as RecoveryPayload;
  } catch (error) {
    if (error instanceof RecoveryError) throw error;
    throw new RecoveryError('RECOVERY_DECRYPTION_FAILED', 'Recovery artifact could not be decrypted', 422);
  }
}

export function sha256(value: unknown): string {
  return crypto.createHash('sha256').update(canonicalJson(value)).digest('hex');
}

export function keyringFromEnvironment(env: NodeJS.ProcessEnv = process.env): RecoveryKeyring {
  const activeKeyId = env.RECOVERY_ACTIVE_KEY_ID || '';
  const encryption = env.RECOVERY_ENCRYPTION_KEY_BASE64 || '';
  const hmac = env.RECOVERY_HMAC_KEY_BASE64 || '';
  if (!activeKeyId || !encryption || !hmac) {
    throw new RecoveryError('RECOVERY_CONFIGURATION_INVALID', 'Recovery key environment is incomplete', 500);
  }
  return {
    activeKeyId,
    encryptionKeys: { [activeKeyId]: Buffer.from(encryption, 'base64') },
    hmacKeys: { [activeKeyId]: Buffer.from(hmac, 'base64') },
  };
}

const crypto = require('node:crypto');
const fs = require('node:fs');

const target = 'Y:\\Compose\\firmbooks-live\\docker-compose.yaml';
const backup = `${target}.prequalification-backup`;

const original = fs.readFileSync(target, 'utf8');
if (!original.includes('JSON_BODY_LIMIT:')) {
  throw new Error('Expected JSON_BODY_LIMIT anchor was not found; refusing to edit');
}

const cleaned = original
  .split(/\r?\n/)
  .filter((line) => !/^\s+(TRUSTED_FINANCE_FEATURES|RECOVERY_ACTIVE_KEY_ID|RECOVERY_ENCRYPTION_KEY_BASE64|RECOVERY_HMAC_KEY_BASE64):/.test(line))
  .join('\n');

const encryptionKey = crypto.randomBytes(32).toString('base64');
let hmacKey = crypto.randomBytes(32).toString('base64');
while (hmacKey === encryptionKey) hmacKey = crypto.randomBytes(32).toString('base64');

const settings = [
  '      TRUSTED_FINANCE_FEATURES: "recovery-center,period-close"',
  '      RECOVERY_ACTIVE_KEY_ID: "recovery-v1"',
  `      RECOVERY_ENCRYPTION_KEY_BASE64: "${encryptionKey}"`,
  `      RECOVERY_HMAC_KEY_BASE64: "${hmacKey}"`,
].join('\n');

const updated = cleaned.replace(
  /(^\s+JSON_BODY_LIMIT:[^\r\n]*$)/m,
  `$1\n${settings}`,
);

if (!fs.existsSync(backup)) fs.copyFileSync(target, backup);
fs.writeFileSync(target, updated.replace(/\n/g, '\r\n'), 'utf8');
console.log('NAS_COMPOSE_CONFIGURATION_UPDATED');

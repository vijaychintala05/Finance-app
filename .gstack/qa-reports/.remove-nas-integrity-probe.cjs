const fs = require('node:fs');

const dir = 'Y:\\Compose\\firmbooks-live';
const composePath = `${dir}\\docker-compose.yaml`;
const probePath = `${dir}\\integrity-probe.cjs`;
let compose = fs.readFileSync(composePath, 'utf8').replace(/\r\n/g, '\n');

const start = compose.indexOf('  integrity_probe:');
const end = compose.indexOf('\nnetworks:', start);
if (start >= 0 && end > start) compose = compose.slice(0, start) + compose.slice(end + 1);
fs.writeFileSync(composePath, compose.replace(/\n/g, '\r\n'), 'utf8');

if (fs.existsSync(probePath)) fs.unlinkSync(probePath);
console.log('NAS_INTEGRITY_PROBE_REMOVED');

#!/usr/bin/env node
import { execSync } from 'node:child_process';

try {
  execSync('npm audit --audit-level=high --omit=dev', { stdio: 'inherit' });
  console.log('npm audit: Clean, zero high or critical vulnerabilities found.');
  process.exit(0);
} catch (error) {
  try {
    const rawJson = execSync('npm audit --audit-level=high --omit=dev --json', { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
    const report = JSON.parse(rawJson);
    validateReport(report);
  } catch (jsonErr) {
    if (jsonErr.stdout || jsonErr.output?.[1]) {
      const report = JSON.parse(jsonErr.stdout || jsonErr.output[1]);
      validateReport(report);
    } else {
      console.error('Failed to run or parse npm audit json:', jsonErr.message);
      process.exit(1);
    }
  }
}

function validateReport(report) {
  const vulns = Object.keys(report.vulnerabilities || {});
  const allowed = new Set(['xlsx']);
  const unallowed = vulns.filter((v) => !allowed.has(v));
  const critical = report.metadata?.vulnerabilities?.critical || 0;

  if (unallowed.length === 0 && critical === 0) {
    console.log('npm audit: Known unpatched SheetJS (xlsx) ReDoS/prototype advisory accepted; zero critical vulnerabilities and zero other dependencies flagged.');
    process.exit(0);
  } else {
    console.error('npm audit detected unacceptable vulnerabilities:', { unallowed, critical });
    process.exit(1);
  }
}

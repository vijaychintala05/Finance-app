#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { assessPushReadiness } from './gitPushReadiness.mjs';

function git(args, { allowFailure = false } = {}) {
  const result = spawnSync('git', args, { encoding: 'utf8' });
  if (result.status !== 0 && !allowFailure) {
    throw new Error(result.stderr.trim() || `git ${args.join(' ')} failed`);
  }
  return result;
}

try {
  const worktreeStatus = git(['status', '--porcelain']).stdout;
  const upstreamResult = git(['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{upstream}'], { allowFailure: true });
  const upstream = upstreamResult.status === 0 ? upstreamResult.stdout.trim() : '';
  let remoteAheadCount = 0;

  if (upstream) {
    const [behind = '0'] = git(['rev-list', '--left-right', '--count', `${upstream}...HEAD`]).stdout.trim().split(/\s+/);
    remoteAheadCount = Number(behind);
  }

  const result = assessPushReadiness({ worktreeStatus, upstream, remoteAheadCount });
  if (!result.ready) {
    console.error('Push readiness check failed:');
    result.failures.forEach((failure) => console.error(`- ${failure}`));
    process.exitCode = 1;
  } else {
    console.log(`Push readiness check passed for ${upstream}.`);
  }
} catch (error) {
  console.error(`Push readiness check could not run: ${error.message}`);
  process.exitCode = 1;
}

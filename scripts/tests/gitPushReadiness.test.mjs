import test from 'node:test';
import assert from 'node:assert/strict';
import { assessPushReadiness } from '../gitPushReadiness.mjs';

test('accepts a clean branch with an upstream that is not behind', () => {
  assert.deepEqual(
    assessPushReadiness({ worktreeStatus: '', upstream: 'origin/main', remoteAheadCount: 0 }),
    { ready: true, failures: [] },
  );
});

test('rejects a dirty worktree before a push', () => {
  const result = assessPushReadiness({ worktreeStatus: ' M src/App.tsx', upstream: 'origin/main', remoteAheadCount: 0 });
  assert.equal(result.ready, false);
  assert.match(result.failures[0], /uncommitted changes/i);
});

test('rejects a branch without an upstream remote', () => {
  const result = assessPushReadiness({ worktreeStatus: '', upstream: '', remoteAheadCount: 0 });
  assert.equal(result.ready, false);
  assert.match(result.failures[0], /no configured upstream/i);
});

test('rejects a non-fast-forward push before it reaches the remote', () => {
  const result = assessPushReadiness({ worktreeStatus: '', upstream: 'origin/main', remoteAheadCount: 2 });
  assert.equal(result.ready, false);
  assert.match(result.failures[0], /Remote upstream is ahead by 2 commit/i);
});

import { describe, expect, it } from 'vitest';
import { assessPushReadiness } from '../gitPushReadiness.mjs';

describe('assessPushReadiness', () => {
  it('accepts a clean branch with an upstream that is not behind', () => {
    expect(assessPushReadiness({ worktreeStatus: '', upstream: 'origin/main', remoteAheadCount: 0 })).toEqual({
      ready: true,
      failures: [],
    });
  });

  it('rejects a dirty worktree before a push', () => {
    const result = assessPushReadiness({ worktreeStatus: ' M src/App.tsx', upstream: 'origin/main', remoteAheadCount: 0 });
    expect(result.ready).toBe(false);
    expect(result.failures[0]).toMatch(/uncommitted changes/i);
  });

  it('rejects a branch without an upstream remote', () => {
    const result = assessPushReadiness({ worktreeStatus: '', upstream: '', remoteAheadCount: 0 });
    expect(result.ready).toBe(false);
    expect(result.failures[0]).toMatch(/no configured upstream/i);
  });

  it('rejects a non-fast-forward push before it reaches the remote', () => {
    const result = assessPushReadiness({ worktreeStatus: '', upstream: 'origin/main', remoteAheadCount: 2 });
    expect(result.ready).toBe(false);
    expect(result.failures[0]).toMatch(/Remote upstream is ahead by 2 commit/i);
  });
});

/**
 * Classifies local Git state before a push. Keep this logic side-effect free so
 * the command-line guard and its regression tests exercise the same rules.
 */
export function assessPushReadiness({ worktreeStatus, upstream, remoteAheadCount }) {
  const failures = [];

  if (worktreeStatus.trim()) {
    failures.push('Working tree has uncommitted changes. Commit or stash them before pushing.');
  }
  if (!upstream) {
    failures.push('Current branch has no configured upstream remote.');
  }
  if (remoteAheadCount > 0) {
    failures.push(`Remote upstream is ahead by ${remoteAheadCount} commit(s). Pull and integrate those commits before pushing.`);
  }

  return { ready: failures.length === 0, failures };
}

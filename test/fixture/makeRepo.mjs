// Builds the deterministic fixture repository used by the integration tests.
import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

// Expected file lists and hunk lines per mode, shared with the tests.
export const FIXTURE = {
  worktree: {
    files: [
      ['a.txt', 'modified'],
      ['src/b.ts', 'modified'],
      ['untracked.txt', 'untracked'],
    ],
    hunks: { 'a.txt': [9], 'src/b.ts': [18], 'untracked.txt': [1] },
  },
  branch: {
    base: 'master',
    files: [
      ['deleted.txt', 'deleted'],
      ['new.txt', 'added'],
      ['src/b.ts', 'modified'],
    ],
    hunks: { 'deleted.txt': [1], 'new.txt': [1], 'src/b.ts': [3, 15] },
  },
  refs: {
    from: 'master~1',
    to: 'master',
    files: [['a.txt', 'modified']],
    hunks: { 'a.txt': [1] },
  },
};

const lines = (prefix, count, overrides = {}) =>
  Array.from({ length: count }, (_, i) => overrides[i + 1] ?? `${prefix}${i + 1}`).join('\n') + '\n';

export function createFixtureRepo(dir) {
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });

  const env = {
    ...process.env,
    GIT_AUTHOR_NAME: 'QuickDiff',
    GIT_AUTHOR_EMAIL: 'quickdiff@example.com',
    GIT_AUTHOR_DATE: '2026-01-01T00:00:00Z',
    GIT_COMMITTER_NAME: 'QuickDiff',
    GIT_COMMITTER_EMAIL: 'quickdiff@example.com',
    GIT_COMMITTER_DATE: '2026-01-01T00:00:00Z',
    GIT_CONFIG_GLOBAL: '/dev/null',
    GIT_CONFIG_NOSYSTEM: '1',
  };
  const git = (...args) => execFileSync('git', args, { cwd: dir, env, stdio: 'pipe' });
  const write = (path, content) => {
    const full = join(dir, path);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, content);
  };

  git('init', '-q', '-b', 'master');

  // Commit 1 on master.
  write('a.txt', lines('a', 10));
  write('src/b.ts', lines('b', 20));
  write('deleted.txt', lines('d', 3));
  git('add', '-A');
  git('commit', '-q', '-m', 'initial');

  // Commit 2 on feature.
  git('checkout', '-q', '-b', 'feature');
  write('src/b.ts', lines('b', 20, { 3: 'b3-changed', 15: 'b15-changed' }));
  write('new.txt', lines('n', 2));
  git('rm', '-q', 'deleted.txt');
  git('add', '-A');
  git('commit', '-q', '-m', 'feature work');

  // Commit 3 on master.
  git('checkout', '-q', 'master');
  write('a.txt', lines('a', 10, { 1: 'a1-master' }));
  git('commit', '-q', '-am', 'master work');

  // Working tree on feature.
  git('checkout', '-q', 'feature');
  write('a.txt', lines('a', 10, { 9: 'a9-wip' }));
  write('src/b.ts', lines('b', 20, { 3: 'b3-changed', 15: 'b15-changed', 18: 'b18-staged' }));
  git('add', 'src/b.ts');
  write('untracked.txt', 'untracked\n');
}

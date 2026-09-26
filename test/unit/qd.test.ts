import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { formatOpenUrl, parseOpenQuery, type OpenRequest } from '../../src/core/mode';

const QD = resolve(__dirname, '../../bin/qd');
const gitEnv = {
  ...process.env,
  GIT_CONFIG_GLOBAL: '/dev/null',
  GIT_CONFIG_NOSYSTEM: '1',
  GIT_AUTHOR_NAME: 't',
  GIT_AUTHOR_EMAIL: 't@example.com',
  GIT_COMMITTER_NAME: 't',
  GIT_COMMITTER_EMAIL: 't@example.com',
};

function makeRepo(dir: string): void {
  mkdirSync(join(dir, 'sub'), { recursive: true });
  writeFileSync(join(dir, 'f.txt'), 'x\n');
  execFileSync('git', ['init', '-q', '-b', 'master'], { cwd: dir, env: gitEnv });
  execFileSync('git', ['add', '-A'], { cwd: dir, env: gitEnv });
  execFileSync('git', ['commit', '-q', '-m', 'init'], { cwd: dir, env: gitEnv });
}

function qd(cwd: string, args: string[], env: Record<string, string> = {}) {
  return spawnSync(QD, args, { cwd, env: { ...gitEnv, ...env }, encoding: 'utf8' });
}

/** What the extension's URI handler receives: the query after VS Code decodes it once. */
function delivered(url: string): OpenRequest | undefined {
  return parseOpenQuery(decodeURIComponent(url.slice(url.indexOf('?') + 1)));
}

describe('bin/qd', () => {
  let root: string;
  let repo: string;

  beforeAll(() => {
    root = realpathSync(mkdtempSync(join(tmpdir(), 'qd-test-')));
    repo = join(root, 'repo');
    makeRepo(repo);
  });

  afterAll(() => rmSync(root, { recursive: true, force: true }));

  it('prints a worktree url for the top-level from a subdirectory', () => {
    const result = qd(join(repo, 'sub'), ['--print-url']);
    expect(result.status).toBe(0);
    expect(result.stdout.trim()).toBe(formatOpenUrl({ cwd: repo, mode: { kind: 'worktree' }, view: 'file' }));
  });

  it('prints a branch url for one ref', () => {
    const result = qd(repo, ['master', '--print-url']);
    expect(result.stdout.trim()).toBe(
      formatOpenUrl({ cwd: repo, mode: { kind: 'branch', base: 'master' }, view: 'file' }),
    );
    expect(result.stdout).toContain('mode=branch&base=master');
  });

  it('prints a refs url for two refs with -a', () => {
    const result = qd(repo, ['a', 'b', '-a', '--print-url']);
    expect(result.stdout.trim()).toBe(
      formatOpenUrl({ cwd: repo, mode: { kind: 'refs', from: 'a', to: 'b' }, view: 'all' }),
    );
    expect(result.stdout).toContain('mode=refs&from=a&to=b&view=all');
  });

  it('encodes reserved characters so they survive VS Code decoding', () => {
    const odd = join(root, 'my repo+x&y=z%');
    makeRepo(odd);
    const result = qd(odd, ['feature/a+b', '--print-url']);
    expect(delivered(result.stdout.trim())).toEqual({
      cwd: odd,
      mode: { kind: 'branch', base: 'feature/a+b' },
      view: 'file',
    });
  });

  it('uses the insiders scheme for an insiders binary', () => {
    const result = qd(repo, ['--print-url'], { QD_CODE_BIN: 'code-insiders' });
    expect(result.stdout.startsWith('vscode-insiders://abogoyavlensky.quickdiff/open?')).toBe(true);
  });

  it('fails outside a git repository', () => {
    const outside = join(root, 'plain');
    mkdirSync(outside);
    const result = qd(outside, ['--print-url'], { GIT_CEILING_DIRECTORIES: root });
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/not inside a git repository/);
    expect(result.stdout).toBe('');
  });

  it('rejects more than two refs', () => {
    const result = qd(repo, ['a', 'b', 'c', '--print-url']);
    expect(result.status).toBe(2);
    expect(result.stderr).toMatch(/usage/i);
  });
});

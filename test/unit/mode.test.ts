import { describe, expect, it } from 'vitest';
import { formatOpenQuery, modeLabel, parseOpenQuery, type OpenRequest } from '../../src/core/mode';

describe('modeLabel', () => {
  it('labels each mode', () => {
    expect(modeLabel({ kind: 'worktree' })).toBe('working tree');
    expect(modeLabel({ kind: 'branch', base: 'master' })).toBe('HEAD → master');
    expect(modeLabel({ kind: 'refs', from: 'abc', to: 'def' })).toBe('abc..def');
  });
});

describe('open query codec', () => {
  const requests: OpenRequest[] = [
    { cwd: '/repo', mode: { kind: 'worktree' }, view: 'file' },
    { cwd: '/repo', mode: { kind: 'branch', base: 'main' }, view: 'all' },
    { cwd: '/my repo/x', mode: { kind: 'refs', from: 'v1.0', to: 'feature/x' }, view: 'file' },
  ];

  it.each(requests)('round-trips %j', (request) => {
    expect(parseOpenQuery(formatOpenQuery(request))).toEqual(request);
  });

  it('defaults view to file', () => {
    expect(parseOpenQuery('cwd=%2Frepo&mode=worktree')).toEqual({
      cwd: '/repo',
      mode: { kind: 'worktree' },
      view: 'file',
    });
  });

  it('decodes a cwd with spaces', () => {
    expect(parseOpenQuery('cwd=%2Fhome%2Fme%2Fmy%20repo&mode=worktree')?.cwd).toBe('/home/me/my repo');
  });

  it.each([
    ['missing cwd', 'mode=worktree'],
    ['unknown mode', 'cwd=%2Frepo&mode=staged'],
    ['missing mode', 'cwd=%2Frepo'],
    ['branch without base', 'cwd=%2Frepo&mode=branch'],
    ['refs without to', 'cwd=%2Frepo&mode=refs&from=a'],
    ['refs without from', 'cwd=%2Frepo&mode=refs&to=b'],
    ['unknown view', 'cwd=%2Frepo&mode=worktree&view=grid'],
  ])('rejects %s', (_name, query) => {
    expect(parseOpenQuery(query)).toBeUndefined();
  });
});

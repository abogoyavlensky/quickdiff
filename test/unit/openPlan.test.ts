import { describe, expect, it } from 'vitest';
import type { OpenRequest } from '../../src/core/mode';
import { isInside, planOpen } from '../../src/core/openPlan';

const request = (cwd: string): OpenRequest => ({ cwd, mode: { kind: 'worktree' }, view: 'file' });

describe('planOpen', () => {
  it('applies when cwd is the folder', () => {
    expect(planOpen(request('/repo'), ['/repo'])).toEqual({ action: 'apply', request: request('/repo') });
  });

  it('applies when cwd is inside a folder', () => {
    expect(planOpen(request('/repo/src/deep'), ['/other', '/repo']).action).toBe('apply');
  });

  it('opens the folder when cwd is outside every folder', () => {
    expect(planOpen(request('/elsewhere'), ['/repo'])).toEqual({
      action: 'openFolder',
      folder: '/elsewhere',
      request: request('/elsewhere'),
    });
  });

  it('opens the folder when no folders are open', () => {
    expect(planOpen(request('/repo'), [])).toMatchObject({ action: 'openFolder', folder: '/repo' });
  });

  it('does not treat a string prefix as a path prefix', () => {
    expect(planOpen(request('/repo2'), ['/repo']).action).toBe('openFolder');
  });

  it('normalizes trailing slashes', () => {
    expect(planOpen(request('/repo/'), ['/repo']).action).toBe('apply');
    expect(planOpen(request('/repo'), ['/repo/']).action).toBe('apply');
    expect(planOpen(request('/repo/'), [])).toMatchObject({ action: 'openFolder', folder: '/repo' });
  });

  it('rejects a relative cwd', () => {
    expect(planOpen(request('repo'), ['/repo']).action).toBe('reject');
  });
});

describe('isInside', () => {
  it('checks path containment', () => {
    expect(isInside('/repo', '/repo')).toBe(true);
    expect(isInside('/repo/a/b', '/repo')).toBe(true);
    expect(isInside('/repo2', '/repo')).toBe(false);
    expect(isInside('/', '/repo')).toBe(false);
    expect(isInside('/repo/..x', '/repo')).toBe(true);
  });
});

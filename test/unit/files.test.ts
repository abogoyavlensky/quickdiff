import { describe, expect, it } from 'vitest';
import type { Uri } from 'vscode';
import { GitStatus } from '../../src/gitTypes';
import { sortFiles, statusFromGit, toFileChange, wrapIndex, type FileChange } from '../../src/core/files';

const uri = (fsPath: string) => ({ fsPath, path: fsPath }) as unknown as Uri;

describe('statusFromGit', () => {
  it.each([
    [GitStatus.INDEX_ADDED, 'added'],
    [GitStatus.INTENT_TO_ADD, 'added'],
    [GitStatus.INDEX_DELETED, 'deleted'],
    [GitStatus.DELETED, 'deleted'],
    [GitStatus.INDEX_RENAMED, 'renamed'],
    [GitStatus.INTENT_TO_RENAME, 'renamed'],
    [GitStatus.UNTRACKED, 'untracked'],
    [GitStatus.MODIFIED, 'modified'],
    [GitStatus.INDEX_MODIFIED, 'modified'],
    [GitStatus.TYPE_CHANGED, 'modified'],
    [GitStatus.BOTH_MODIFIED, 'modified'],
  ])('maps %i to %s', (status, expected) => {
    expect(statusFromGit(status)).toBe(expected);
  });
});

describe('sortFiles', () => {
  const file = (path: string, status: FileChange['status'] = 'modified'): FileChange => ({
    path,
    status,
    uri: uri(`/repo/${path}`),
    originalUri: uri(`/repo/${path}`),
  });

  it('orders by path without mutating the input', () => {
    const input = [file('src/b.ts'), file('a.txt'), file('new.txt')];
    expect(sortFiles(input).map((f) => f.path)).toEqual(['a.txt', 'new.txt', 'src/b.ts']);
    expect(input.map((f) => f.path)).toEqual(['src/b.ts', 'a.txt', 'new.txt']);
  });

  it('is stable for equal paths', () => {
    const input = [file('a.txt', 'deleted'), file('a.txt', 'untracked')];
    expect(sortFiles(input).map((f) => f.status)).toEqual(['deleted', 'untracked']);
  });
});

describe('wrapIndex', () => {
  it('wraps in both directions', () => {
    expect(wrapIndex(3, 3)).toBe(0);
    expect(wrapIndex(-1, 3)).toBe(2);
    expect(wrapIndex(1, 3)).toBe(1);
    expect(wrapIndex(-4, 3)).toBe(2);
  });

  it('returns 0 for an empty list', () => {
    expect(wrapIndex(5, 0)).toBe(0);
  });
});

describe('toFileChange', () => {
  it('builds a repo-relative path', () => {
    const change = { uri: uri('/repo/src/b.ts'), originalUri: uri('/repo/src/b.ts'), renameUri: undefined, status: GitStatus.MODIFIED };
    expect(toFileChange(change, '/repo')).toEqual({
      path: 'src/b.ts',
      status: 'modified',
      uri: change.uri,
      originalUri: change.originalUri,
    });
  });

  it('uses the rename target as the current path', () => {
    const change = {
      uri: uri('/repo/old.txt'),
      originalUri: uri('/repo/old.txt'),
      renameUri: uri('/repo/dir/new.txt'),
      status: GitStatus.INDEX_RENAMED,
    };
    const result = toFileChange(change, '/repo/');
    expect(result.path).toBe('dir/new.txt');
    expect(result.status).toBe('renamed');
    expect(result.uri).toBe(change.renameUri);
    expect(result.originalUri).toBe(change.originalUri);
  });
});

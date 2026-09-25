import { relative, sep } from 'node:path';
import type { Uri } from 'vscode';
import { GitStatus } from '../gitTypes';

export type FileStatus = 'added' | 'modified' | 'deleted' | 'renamed' | 'untracked';

export interface FileChange {
  /** Repo-relative, forward slashes; for renames the new path. */
  path: string;
  status: FileStatus;
  /** Current path (renameUri ?? uri). */
  uri: Uri;
  originalUri: Uri;
}

/** The subset of the git extension's `Change` that core reads. */
export interface GitChangeLike {
  uri: Uri;
  originalUri: Uri;
  renameUri: Uri | undefined;
  status: number;
}

export function statusFromGit(status: number): FileStatus {
  switch (status) {
    case GitStatus.INDEX_ADDED:
    case GitStatus.INTENT_TO_ADD:
      return 'added';
    case GitStatus.INDEX_DELETED:
    case GitStatus.DELETED:
      return 'deleted';
    case GitStatus.INDEX_RENAMED:
    case GitStatus.INTENT_TO_RENAME:
      return 'renamed';
    case GitStatus.UNTRACKED:
      return 'untracked';
    default:
      return 'modified';
  }
}

export function toFileChange(change: GitChangeLike, rootFsPath: string): FileChange {
  const uri = change.renameUri ?? change.uri;
  return {
    path: relative(rootFsPath, uri.fsPath).split(sep).join('/'),
    status: statusFromGit(change.status),
    uri,
    originalUri: change.originalUri,
  };
}

export function sortFiles(files: readonly FileChange[]): FileChange[] {
  return [...files].sort((a, b) => a.path.localeCompare(b.path));
}

export function wrapIndex(i: number, length: number): number {
  return length === 0 ? 0 : ((i % length) + length) % length;
}

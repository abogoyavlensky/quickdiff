import * as vscode from 'vscode';
import type { FileChange } from './core/files';
import type { API } from './gitTypes';
import type { ResolvedRefs } from './model';

export const EMPTY_SCHEME = 'quickdiff-empty';

export interface DiffSides {
  left: vscode.Uri;
  right: vscode.Uri;
  title: string;
}

/** Serves an empty document for the missing side of added, untracked, and deleted files. */
export function registerEmptyProvider(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.workspace.registerTextDocumentContentProvider(EMPTY_SCHEME, { provideTextDocumentContent: () => '' }),
  );
}

/** The path mirrors the file path so the editor title stays meaningful. */
export function emptyUri(path: string): vscode.Uri {
  return vscode.Uri.from({ scheme: EMPTY_SCHEME, path });
}

function leftUri(file: FileChange, resolved: ResolvedRefs, api: API): vscode.Uri | undefined {
  return file.status === 'added' || file.status === 'untracked' ? undefined : api.toGitUri(file.originalUri, resolved.left);
}

function rightUri(file: FileChange, resolved: ResolvedRefs, api: API): vscode.Uri | undefined {
  if (file.status === 'deleted') {
    return undefined;
  }
  return resolved.right === 'worktree' ? file.uri : api.toGitUri(file.uri, resolved.right);
}

export function sidesFor(file: FileChange, resolved: ResolvedRefs, api: API, label: string): DiffSides {
  return {
    left: leftUri(file, resolved, api) ?? emptyUri(file.originalUri.path),
    right: rightUri(file, resolved, api) ?? emptyUri(file.uri.path),
    title: `${file.path} (${label})`,
  };
}

/** Resource tuple for `vscode.changes`; `undefined` marks a missing side. */
export function multiDiffTuple(
  file: FileChange,
  resolved: ResolvedRefs,
  api: API,
): [vscode.Uri, vscode.Uri | undefined, vscode.Uri | undefined] {
  return [file.uri, leftUri(file, resolved, api), rightUri(file, resolved, api)];
}

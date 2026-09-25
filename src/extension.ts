import * as vscode from 'vscode';

export interface QuickDiffApi {
  /** Repository discovery finished (found or not) and the first refresh is done. */
  ready: Promise<void>;
  // TODO(Task 5): make model required-shaped (`ChangesModel | undefined`).
  model?: unknown;
  filesProvider?: vscode.TreeDataProvider<unknown>;
  treeView?: vscode.TreeView<unknown>;
  handleUri?(uri: vscode.Uri): Promise<void>;
}

export function activate(_context: vscode.ExtensionContext): QuickDiffApi {
  return { ready: Promise.resolve() };
}

export function deactivate(): void {}

import * as vscode from 'vscode';
import { getGitApi, waitForRepository } from './git';
import { ChangesModel } from './model';

export interface QuickDiffApi {
  /** Repository discovery finished (found or not) and the first refresh is done. */
  ready: Promise<void>;
  /** Undefined when no repository was found. */
  model: ChangesModel | undefined;
  // TODO(Tasks 7, 11): make required once the view and URI handler exist.
  filesProvider?: vscode.TreeDataProvider<unknown>;
  treeView?: vscode.TreeView<unknown>;
  handleUri?(uri: vscode.Uri): Promise<void>;
}

export const NO_REPOSITORY_MESSAGE = 'QuickDiff: no git repository in this window';

export function activate(context: vscode.ExtensionContext): QuickDiffApi {
  const output = vscode.window.createOutputChannel('QuickDiff');
  context.subscriptions.push(output);

  const api: QuickDiffApi = { ready: Promise.resolve(), model: undefined };

  api.ready = (async () => {
    try {
      const folder = vscode.workspace.workspaceFolders?.[0];
      if (!folder) {
        throw new Error('No workspace folder is open');
      }
      const gitApi = await getGitApi();
      const repo = await waitForRepository(gitApi, folder.uri);
      const model = new ChangesModel(gitApi, repo, context.workspaceState);
      context.subscriptions.push(model);
      api.model = model;
      await initialRefresh(model, output);
    } catch (error) {
      output.appendLine(`Repository discovery failed: ${errorMessage(error)}`);
      await vscode.commands.executeCommand('setContext', 'quickdiff.noRepository', true);
    }
  })();

  return api;
}

/** Refreshes the persisted mode; if it no longer resolves, falls back to the working tree. */
async function initialRefresh(model: ChangesModel, output: vscode.OutputChannel): Promise<void> {
  try {
    await model.refresh();
  } catch (error) {
    output.appendLine(`Initial refresh failed: ${errorMessage(error)}`);
    if (model.mode.kind === 'worktree') {
      return;
    }
    try {
      await model.setMode({ kind: 'worktree' });
    } catch (fallbackError) {
      output.appendLine(`Working tree refresh failed: ${errorMessage(fallbackError)}`);
    }
  }
}

/** Returns the model, or shows the no-repository message and returns undefined. */
export function requireModel(api: QuickDiffApi): ChangesModel | undefined {
  if (!api.model) {
    void vscode.window.showErrorMessage(NO_REPOSITORY_MESSAGE);
  }
  return api.model;
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function deactivate(): void {}

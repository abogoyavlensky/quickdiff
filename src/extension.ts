import * as vscode from 'vscode';
import type { FileChange } from './core/files';
import { modeLabel } from './core/mode';
import { createFilesView } from './filesView';
import { getGitApi, waitForRepository } from './git';
import { ChangesModel } from './model';
import { openFile, type OpenOptions } from './opener';
import { registerEmptyProvider } from './sides';

export interface QuickDiffApi {
  /** Repository discovery finished (found or not) and the first refresh is done. */
  ready: Promise<void>;
  /** Undefined when no repository was found. */
  model: ChangesModel | undefined;
  filesProvider: vscode.TreeDataProvider<FileChange>;
  treeView: vscode.TreeView<FileChange>;
  // TODO(Task 11): make required once the URI handler exists.
  handleUri?(uri: vscode.Uri): Promise<void>;
}

export const NO_REPOSITORY_MESSAGE = 'QuickDiff: no git repository in this window';

export function activate(context: vscode.ExtensionContext): QuickDiffApi {
  const output = vscode.window.createOutputChannel('QuickDiff');
  context.subscriptions.push(output);

  registerEmptyProvider(context);
  const filesView = createFilesView(context);

  const api: QuickDiffApi = {
    ready: Promise.resolve(),
    model: undefined,
    filesProvider: filesView.provider,
    treeView: filesView.treeView,
  };

  const register = (id: string, handler: (...args: any[]) => Promise<unknown> | unknown) =>
    context.subscriptions.push(vscode.commands.registerCommand(id, guarded(output, handler)));

  register('quickdiff.openFile', async (arg: FileChange | string | undefined, opts?: OpenOptions) => {
    const model = await requireModel(api);
    const path = typeof arg === 'string' ? arg : arg?.path;
    const file = model?.files.find((f) => f.path === path);
    if (model && file) {
      await openFile(model, file, opts);
    }
  });

  register('quickdiff.refresh', async () => {
    const model = await requireModel(api);
    if (model) {
      await model.refresh().catch((error) => showGitError(model, error));
    }
  });

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
      filesView.attach(model);
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

/** Wraps a command handler so a rejection is shown and logged instead of going unhandled. */
function guarded(
  output: vscode.OutputChannel,
  handler: (...args: any[]) => Promise<unknown> | unknown,
): (...args: any[]) => Promise<void> {
  return async (...args) => {
    try {
      await handler(...args);
    } catch (error) {
      output.appendLine(`Command failed: ${errorMessage(error)}`);
      void vscode.window.showErrorMessage(`QuickDiff: ${errorMessage(error)}`);
    }
  };
}

/**
 * Waits for repository discovery, then returns the model, or shows the no-repository
 * message and returns undefined.
 */
export async function requireModel(api: QuickDiffApi): Promise<ChangesModel | undefined> {
  await api.ready;
  if (!api.model) {
    void vscode.window.showErrorMessage(NO_REPOSITORY_MESSAGE);
  }
  return api.model;
}

/** Shows a git failure with the mode it happened in; the model keeps its last good list. */
export function showGitError(model: ChangesModel, error: unknown): void {
  void vscode.window.showErrorMessage(`QuickDiff (${modeLabel(model.mode)}): ${errorMessage(error)}`);
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function deactivate(): void {}

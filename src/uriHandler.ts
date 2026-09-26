import * as vscode from 'vscode';
import { parseOpenQuery, type OpenRequest } from './core/mode';
import { planOpen } from './core/openPlan';
import type { ChangesModel } from './model';
import { openAll, openFile } from './opener';

const PENDING_KEY = 'quickdiff.pendingOpen';
const PENDING_MAX_AGE_MS = 2 * 60 * 1000;

interface PendingOpen {
  request: OpenRequest;
  at: number;
}

export interface UriDeps {
  context: vscode.ExtensionContext;
  /** Resolves when repository discovery has finished, found or not. */
  ready: Promise<void>;
  model(): ChangesModel | undefined;
  showGitError(model: ChangesModel, error: unknown): void;
}

/** Folders a request may apply to: the bound repository, else the open workspace folders. */
function candidateFolders(model: ChangesModel | undefined): string[] {
  return model ? [model.repositoryRoot] : (vscode.workspace.workspaceFolders ?? []).map((f) => f.uri.fsPath);
}

export function registerUriHandler(deps: UriDeps): (uri: vscode.Uri) => Promise<void> {
  const handleUri = async (uri: vscode.Uri): Promise<void> => {
    const request = uri.path === '/open' ? parseOpenQuery(uri.query) : undefined;
    if (!request) {
      void vscode.window.showErrorMessage(`QuickDiff: invalid open request ${uri.toString(true)}`);
      return;
    }
    await deps.ready;
    const model = deps.model();
    const plan = planOpen(request, candidateFolders(model));
    switch (plan.action) {
      case 'apply':
        await applyRequest(deps, plan.request);
        return;
      case 'openFolder': {
        const pending: PendingOpen = { request: plan.request, at: Date.now() };
        await deps.context.globalState.update(PENDING_KEY, pending);
        await vscode.commands.executeCommand('vscode.openFolder', vscode.Uri.file(plan.folder), {
          forceNewWindow: false,
        });
        return;
      }
      case 'reject':
        void vscode.window.showErrorMessage(`QuickDiff: ${plan.reason}`);
        return;
    }
  };
  deps.context.subscriptions.push(vscode.window.registerUriHandler({ handleUri }));
  return handleUri;
}

/** Sets the mode, focuses the list, and opens the first file or the multi-diff editor. */
export async function applyRequest(deps: UriDeps, request: OpenRequest): Promise<void> {
  const model = deps.model();
  if (!model) {
    return;
  }
  try {
    await model.setMode(request.mode);
  } catch (error) {
    deps.showGitError(model, error);
    return;
  }
  await vscode.commands.executeCommand('quickdiff.files.focus');
  if (request.view === 'all') {
    await openAll(model);
  } else if (model.files.length > 0) {
    await openFile(model, model.files[0]);
  } else {
    vscode.window.setStatusBarMessage('QuickDiff: no changes', 2000);
  }
}

/** Applies a request stored before `vscode.openFolder` restarted the window; always clears it. */
export async function replayPending(deps: UriDeps): Promise<void> {
  const pending = deps.context.globalState.get<PendingOpen>(PENDING_KEY);
  if (!pending) {
    return;
  }
  await deps.context.globalState.update(PENDING_KEY, undefined);
  await deps.ready;
  const model = deps.model();
  const fresh = Date.now() - pending.at < PENDING_MAX_AGE_MS;
  if (model && fresh && planOpen(pending.request, [model.repositoryRoot]).action === 'apply') {
    await applyRequest(deps, pending.request);
  }
}

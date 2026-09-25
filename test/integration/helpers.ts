import * as vscode from 'vscode';
import type { QuickDiffApi } from '../../src/extension';

export const EXTENSION_ID = 'abogoyavlensky.quickdiff';

export async function getApi(): Promise<QuickDiffApi> {
  const ext = vscode.extensions.getExtension<QuickDiffApi>(EXTENSION_ID);
  if (!ext) {
    throw new Error(`Extension ${EXTENSION_ID} not found`);
  }
  const api = await ext.activate();
  await api.ready;
  return api;
}

export async function waitFor(predicate: () => boolean | Promise<boolean>, timeoutMs = 5000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!(await predicate())) {
    if (Date.now() > deadline) {
      throw new Error(`waitFor timed out after ${timeoutMs} ms`);
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}

export function activeDiffTab(): vscode.Tab | undefined {
  return vscode.window.tabGroups.activeTabGroup.activeTab;
}

export async function closeAllEditors(): Promise<void> {
  await vscode.commands.executeCommand('workbench.action.closeAllEditors');
}

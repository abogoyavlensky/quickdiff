import * as path from 'node:path';
import { pathToFileURL } from 'node:url';
import * as vscode from 'vscode';
import type { FileStatus } from '../../src/core/files';
import type { QuickDiffApi } from '../../src/extension';
import type { ChangesModel } from '../../src/model';

export const EXTENSION_ID = 'abogoyavlensky.quickdiff';

interface ModeFixture {
  files: [string, FileStatus][];
  hunks: Record<string, number[]>;
}

export interface FixtureSpec {
  worktree: ModeFixture;
  branch: ModeFixture & { base: string };
  refs: ModeFixture & { from: string; to: string };
}

/** Loads FIXTURE from test/fixture/makeRepo.mjs, the same module that builds the repository. */
export async function loadFixture(): Promise<FixtureSpec> {
  // Compiled to out/test/integration; the fixture module stays in test/fixture.
  const modulePath = path.resolve(__dirname, '../../../test/fixture/makeRepo.mjs');
  const module = (await import(pathToFileURL(modulePath).href)) as { FIXTURE: FixtureSpec };
  return module.FIXTURE;
}

export async function getApi(): Promise<QuickDiffApi> {
  const ext = vscode.extensions.getExtension<QuickDiffApi>(EXTENSION_ID);
  if (!ext) {
    throw new Error(`Extension ${EXTENSION_ID} not found`);
  }
  const api = await ext.activate();
  await api.ready;
  return api;
}

export async function getModel(): Promise<ChangesModel> {
  const { model } = await getApi();
  if (!model) {
    throw new Error('QuickDiff found no repository in the fixture workspace');
  }
  return model;
}

export async function resetToWorktree(): Promise<void> {
  await (await getModel()).setMode({ kind: 'worktree' });
}

export function listing(model: ChangesModel): [string, FileStatus][] {
  return model.files.map((file) => [file.path, file.status]);
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

import * as vscode from 'vscode';
import type { FileChange } from './core/files';
import { modeLabel } from './core/mode';
import type { ChangesModel } from './model';
import { multiDiffTuple, sidesFor, type DiffSides } from './sides';
import { diffKey, quickDiffTabs, rememberOpened } from './tabs';

/** Every QuickDiff multi-diff editor title starts with this; navigation recognises the tab by it. */
export const MULTI_TITLE_PREFIX = 'QuickDiff: ';

export interface OpenOptions {
  hunk?: 'first' | 'last' | 'none';
}

export function sidesOf(model: ChangesModel, file: FileChange): DiffSides {
  return sidesFor(file, model.resolved, model.api, modeLabel(model.mode));
}

export async function openFile(model: ChangesModel, file: FileChange, opts: OpenOptions = {}): Promise<void> {
  const { left, right, title } = sidesOf(model, file);
  const single = vscode.workspace.getConfiguration('quickdiff').get<boolean>('singleDiffEditor', false);
  const viewColumn = single ? reviewColumn(model) : undefined;
  rememberOpened(left, right);
  await vscode.commands.executeCommand('vscode.diff', left, right, title, {
    preview: true,
    ...(viewColumn === undefined ? {} : { viewColumn }),
  });
  if (single) {
    await closeOtherDiffs(model, diffKey(left, right));
  }
  const hunk = opts.hunk ?? 'first';
  if (hunk === 'none') {
    return;
  }
  const hunks = await model.hunksFor(file);
  const line = hunk === 'first' ? hunks[0] : hunks[hunks.length - 1];
  const editor = vscode.window.activeTextEditor;
  if (line !== undefined && editor?.document.uri.toString() === right.toString()) {
    moveCursor(editor, line);
  }
}

/**
 * The column of an open QuickDiff diff, preferring the active group, so the next diff
 * replaces it where the user reviews. Undefined when none is open.
 */
function reviewColumn(model: ChangesModel): vscode.ViewColumn | undefined {
  const tabs = quickDiffTabs(model);
  const active = vscode.window.tabGroups.activeTabGroup;
  return (tabs.find((tab) => tab.group === active) ?? tabs[0])?.group.viewColumn;
}

/**
 * Closes every QuickDiff diff tab except the one just opened in the active group.
 * Tabs with unsaved edits stay open: closing them would prompt to save.
 */
async function closeOtherDiffs(model: ChangesModel, openedKey: string): Promise<void> {
  const column = vscode.window.tabGroups.activeTabGroup.viewColumn;
  const others = quickDiffTabs(model).filter((tab) => {
    const input = tab.input as vscode.TabInputTextDiff;
    const isNew = tab.group.viewColumn === column && diffKey(input.original, input.modified) === openedKey;
    return !isNew && !tab.isDirty;
  });
  if (others.length > 0) {
    await vscode.window.tabGroups.close(others, true);
  }
}

/** Opens every listed change in the multi-diff editor. */
export async function openAll(model: ChangesModel): Promise<void> {
  if (model.files.length === 0) {
    vscode.window.setStatusBarMessage('QuickDiff: no changes', 2000);
    return;
  }
  const resources = model.files.map((file) => multiDiffTuple(file, model.resolved, model.api));
  await vscode.commands.executeCommand('vscode.changes', MULTI_TITLE_PREFIX + modeLabel(model.mode), resources);
}

/** Places the cursor at the start of a 1-based line and centers it. */
export function moveCursor(editor: vscode.TextEditor, line: number): void {
  const index = Math.min(Math.max(line - 1, 0), Math.max(editor.document.lineCount - 1, 0));
  const position = new vscode.Position(index, 0);
  editor.selection = new vscode.Selection(position, position);
  editor.revealRange(new vscode.Range(position, position), vscode.TextEditorRevealType.InCenter);
}

import * as vscode from 'vscode';
import { wrapIndex, type FileChange } from './core/files';
import { nextHunkLine, prevHunkLine } from './core/hunks';
import type { ChangesModel } from './model';
import { MULTI_TITLE_PREFIX, moveCursor, openFile, sidesOf } from './opener';

export type ActiveContext = { kind: 'multi' } | { kind: 'file'; index: number } | { kind: 'none' };

/** Classifies the active tab: a QuickDiff multi-diff editor, a diff of a listed file, or neither. */
export function activeContext(model: ChangesModel): ActiveContext {
  const tab = vscode.window.tabGroups.activeTabGroup.activeTab;
  if (!tab) {
    return { kind: 'none' };
  }
  const { input } = tab;
  if (input instanceof vscode.TabInputTextDiff) {
    const modified = input.modified.toString();
    const original = input.original.toString();
    const index = model.files.findIndex((file) => {
      const { left, right } = sidesOf(model, file);
      // Deleted files have an empty right side, so they are recognised by their original.
      return file.status === 'deleted' ? left.toString() === original : right.toString() === modified;
    });
    return index >= 0 ? { kind: 'file', index } : { kind: 'none' };
  }
  // TabInputTextMultiDiff is proposed API, so the multi-diff tab is recognised by its title.
  if (!(input instanceof vscode.TabInputText) && tab.label.startsWith(MULTI_TITLE_PREFIX)) {
    return { kind: 'multi' };
  }
  return { kind: 'none' };
}

export function currentIndex(model: ChangesModel): number | undefined {
  const context = activeContext(model);
  return context.kind === 'file' ? context.index : undefined;
}

function noChanges(): void {
  vscode.window.setStatusBarMessage('QuickDiff: no changes', 2000);
}

async function stepFile(model: ChangesModel, direction: 1 | -1, hunk: 'first' | 'last' = 'first'): Promise<void> {
  const context = activeContext(model);
  if (context.kind === 'multi') {
    await vscode.commands.executeCommand(
      direction === 1 ? 'multiDiffEditor.goToNextChange' : 'multiDiffEditor.goToPreviousChange',
    );
    return;
  }
  if (model.files.length === 0) {
    noChanges();
    return;
  }
  // Without a current file, next starts at the first entry and previous at the last.
  const from = context.kind === 'file' ? context.index : direction === 1 ? -1 : 0;
  const file = model.files[wrapIndex(from + direction, model.files.length)];
  await openFile(model, file, { hunk });
}

export const nextFile = (model: ChangesModel) => stepFile(model, 1);
export const prevFile = (model: ChangesModel) => stepFile(model, -1);

/**
 * Returns the modified-side editor of `file`'s diff, focusing it if the original side is active.
 * Returns undefined after re-opening the diff when the modified side cannot be reached.
 */
async function ensureModifiedSide(model: ChangesModel, file: FileChange): Promise<vscode.TextEditor | undefined> {
  const { left, right } = sidesOf(model, file);
  let editor = vscode.window.activeTextEditor;
  if (editor?.document.uri.toString() === left.toString()) {
    await vscode.commands.executeCommand('workbench.action.compareEditor.focusOtherSide');
    editor = vscode.window.activeTextEditor;
  }
  if (editor?.document.uri.toString() !== right.toString()) {
    await openFile(model, file, { hunk: 'first' });
    return undefined;
  }
  return editor;
}

async function stepHunk(model: ChangesModel, direction: 1 | -1): Promise<void> {
  const context = activeContext(model);
  if (context.kind === 'multi') {
    await vscode.commands.executeCommand(
      direction === 1 ? 'multiDiffEditor.goToNextChange' : 'multiDiffEditor.goToPreviousChange',
    );
    return;
  }
  if (context.kind === 'none') {
    await stepFile(model, direction, direction === 1 ? 'first' : 'last');
    return;
  }
  const file = model.files[context.index];
  const editor = await ensureModifiedSide(model, file);
  if (!editor) {
    return;
  }
  const hunks = await model.hunksFor(file);
  const line = editor.selection.active.line + 1;
  const target = direction === 1 ? nextHunkLine(hunks, line) : prevHunkLine(hunks, line);
  if (target !== undefined) {
    moveCursor(editor, target);
  } else {
    // Past the last hunk: next file's first hunk; before the first: previous file's last hunk.
    await stepFile(model, direction, direction === 1 ? 'first' : 'last');
  }
}

export const nextHunk = (model: ChangesModel) => stepHunk(model, 1);
export const prevHunk = (model: ChangesModel) => stepHunk(model, -1);

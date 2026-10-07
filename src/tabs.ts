import * as vscode from 'vscode';
import type { ChangesModel } from './model';
import { sidesOf } from './opener';

/** Sides of every diff QuickDiff opened this session, keyed by `diffKey`. */
const opened = new Set<string>();

/** `${original}\n${modified}`, the key both the opened set and the pair comparison use. */
export function diffKey(original: vscode.Uri, modified: vscode.Uri): string {
  return `${original.toString()}\n${modified.toString()}`;
}

/**
 * Index of the listed file shown by `tab`, matching one side only (right, or left for
 * deleted files). For navigation; too lenient for closing tabs.
 */
export function listedFileIndex(model: ChangesModel, tab: vscode.Tab): number | undefined {
  const { input } = tab;
  if (!(input instanceof vscode.TabInputTextDiff)) {
    return undefined;
  }
  const modified = input.modified.toString();
  const original = input.original.toString();
  const index = model.files.findIndex((file) => {
    const { left, right } = sidesOf(model, file);
    // Deleted files have an empty right side, so they are recognised by their original.
    return file.status === 'deleted' ? left.toString() === original : right.toString() === modified;
  });
  return index >= 0 ? index : undefined;
}

/** Records that QuickDiff opened a diff with these sides; used to recognise the tab later. */
export function rememberOpened(left: vscode.Uri, right: vscode.Uri): void {
  opened.add(diffKey(left, right));
}

/**
 * Every QuickDiff diff tab in every group, matched on both sides: a listed file's exact
 * sides, or a pair opened this session. Safe to close.
 */
export function quickDiffTabs(model: ChangesModel): vscode.Tab[] {
  const listed = new Set(
    model.files.map((file) => {
      const { left, right } = sidesOf(model, file);
      return diffKey(left, right);
    }),
  );
  return vscode.window.tabGroups.all
    .flatMap((group) => group.tabs)
    .filter((tab) => {
      const { input } = tab;
      if (!(input instanceof vscode.TabInputTextDiff)) {
        return false;
      }
      const key = diffKey(input.original, input.modified);
      return opened.has(key) || listed.has(key);
    });
}

import * as vscode from 'vscode';
import type { FileChange } from './core/files';
import { modeLabel } from './core/mode';
import type { ChangesModel } from './model';
import { sidesFor, type DiffSides } from './sides';

export interface OpenOptions {
  hunk?: 'first' | 'last' | 'none';
}

export function sidesOf(model: ChangesModel, file: FileChange): DiffSides {
  return sidesFor(file, model.resolved, model.api, modeLabel(model.mode));
}

export async function openFile(model: ChangesModel, file: FileChange, opts: OpenOptions = {}): Promise<void> {
  const { left, right, title } = sidesOf(model, file);
  await vscode.commands.executeCommand('vscode.diff', left, right, title, { preview: true });
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

/** Places the cursor at the start of a 1-based line and centers it. */
export function moveCursor(editor: vscode.TextEditor, line: number): void {
  const index = Math.min(Math.max(line - 1, 0), Math.max(editor.document.lineCount - 1, 0));
  const position = new vscode.Position(index, 0);
  editor.selection = new vscode.Selection(position, position);
  editor.revealRange(new vscode.Range(position, position), vscode.TextEditorRevealType.InCenter);
}

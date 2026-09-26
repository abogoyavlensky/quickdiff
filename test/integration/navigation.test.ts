import * as assert from 'node:assert';
import * as vscode from 'vscode';
import { activeDiffTab, closeAllEditors, getModel, resetToWorktree, waitFor } from './helpers';

function activeDiffPath(): string | undefined {
  const input = activeDiffTab()?.input;
  if (!(input instanceof vscode.TabInputTextDiff)) {
    return undefined;
  }
  const uri = input.modified.scheme === 'quickdiff-empty' ? input.original : input.modified;
  return vscode.workspace.asRelativePath(uri.fsPath, false);
}

function cursorLine(): number | undefined {
  return vscode.window.activeTextEditor?.selection.active.line;
}

const run = (command: string) => vscode.commands.executeCommand(command);

async function expectAt(path: string, line: number): Promise<void> {
  assert.strictEqual(activeDiffPath(), path);
  assert.strictEqual(cursorLine(), line, `cursor in ${path}`);
}

describe('keyboard navigation', () => {
  beforeEach(async () => {
    await closeAllEditors();
    await resetToWorktree();
  });
  after(async () => {
    await closeAllEditors();
    await resetToWorktree();
  });

  it('steps through files with wrap-around', async () => {
    await run('quickdiff.nextFile');
    await expectAt('a.txt', 8);
    await run('quickdiff.nextFile');
    await expectAt('src/b.ts', 17);
    await run('quickdiff.nextFile');
    await expectAt('untracked.txt', 0);
    await run('quickdiff.nextFile');
    await expectAt('a.txt', 8);
    await run('quickdiff.prevFile');
    await expectAt('untracked.txt', 0);
  });

  it('opens the previous file at its first hunk', async () => {
    const model = await getModel();
    await model.setMode({ kind: 'branch', base: 'master' });
    await vscode.commands.executeCommand('quickdiff.openFile', 'deleted.txt');
    await run('quickdiff.prevFile');
    await expectAt('src/b.ts', 2);
  });

  it('steps through hunks across files in both directions', async () => {
    const model = await getModel();
    await model.setMode({ kind: 'branch', base: 'master' });
    await vscode.commands.executeCommand('quickdiff.openFile', 'src/b.ts');
    await expectAt('src/b.ts', 2);
    await run('quickdiff.nextHunk');
    await expectAt('src/b.ts', 14);
    await run('quickdiff.nextHunk');
    await expectAt('deleted.txt', 0);
    await run('quickdiff.prevHunk');
    await expectAt('src/b.ts', 14);
    await run('quickdiff.prevHunk');
    await expectAt('src/b.ts', 2);
    await run('quickdiff.prevHunk');
    await expectAt('new.txt', 0);
  });

  it('starts from the first file when the active editor is not a QuickDiff diff', async () => {
    const model = await getModel();
    await vscode.window.showTextDocument(model.files[0].uri);
    await run('quickdiff.nextHunk');
    await expectAt('a.txt', 8);
  });

  it('moves to the modified side before stepping from the original side', async () => {
    const model = await getModel();
    await model.setMode({ kind: 'branch', base: 'master' });
    await vscode.commands.executeCommand('quickdiff.openFile', 'src/b.ts');
    const modifiedUri = vscode.window.activeTextEditor?.document.uri.toString();
    await run('workbench.action.compareEditor.focusOtherSide');
    await waitFor(() => vscode.window.activeTextEditor?.document.uri.toString() !== modifiedUri);
    await run('quickdiff.nextHunk');
    assert.strictEqual(vscode.window.activeTextEditor?.document.uri.toString(), modifiedUri);
    assert.strictEqual(cursorLine(), 14);
  });

  it('delegates to the multi-diff editor when it is active', async () => {
    const model = await getModel();
    await model.setMode({ kind: 'branch', base: 'master' });
    await run('quickdiff.openAll');
    const tab = activeDiffTab();
    const tabCount = vscode.window.tabGroups.all.flatMap((g) => g.tabs).length;
    await run('quickdiff.nextHunk');
    assert.strictEqual(vscode.window.tabGroups.all.flatMap((g) => g.tabs).length, tabCount);
    assert.strictEqual(activeDiffTab()?.label, tab?.label);
  });
});

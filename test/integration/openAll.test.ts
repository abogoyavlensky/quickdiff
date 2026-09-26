import * as assert from 'node:assert';
import * as vscode from 'vscode';
import { activeDiffTab, closeAllEditors, getModel, resetToWorktree } from './helpers';

const allTabs = () => vscode.window.tabGroups.all.flatMap((group) => group.tabs);

describe('open all changes', () => {
  beforeEach(closeAllEditors);
  after(async () => {
    await closeAllEditors();
    await resetToWorktree();
  });

  it('opens the multi-diff editor titled with the mode', async () => {
    const model = await getModel();
    await model.setMode({ kind: 'branch', base: 'master' });
    await vscode.commands.executeCommand('quickdiff.openAll');
    const tab = activeDiffTab();
    // VS Code appends a file count, e.g. "QuickDiff: HEAD → master (3 files)".
    assert.ok(tab, 'a tab is active');
    assert.ok(tab.label.startsWith('QuickDiff: HEAD → master'), tab.label);
    assert.ok(!(tab.input instanceof vscode.TabInputText));
    assert.ok(!(tab.input instanceof vscode.TabInputTextDiff));
  });

  it('opens nothing when there are no changes', async () => {
    const model = await getModel();
    await model.setMode({ kind: 'refs', from: 'master', to: 'master' });
    await vscode.commands.executeCommand('quickdiff.openAll');
    assert.strictEqual(allTabs().length, 0);
  });
});

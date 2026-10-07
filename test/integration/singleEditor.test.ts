import * as assert from 'node:assert';
import * as vscode from 'vscode';
import { MULTI_TITLE_PREFIX } from '../../src/opener';
import { activeDiffTab, closeAllEditors, getModel, resetToWorktree, waitFor } from './helpers';

const run = (command: string, ...args: unknown[]) => vscode.commands.executeCommand(command, ...args);

const allTabs = () => vscode.window.tabGroups.all.flatMap((group) => group.tabs);

const diffTabs = () => allTabs().filter((tab) => tab.input instanceof vscode.TabInputTextDiff);

function diffPath(tab: vscode.Tab | undefined): string | undefined {
  const input = tab?.input;
  if (!(input instanceof vscode.TabInputTextDiff)) {
    return undefined;
  }
  const uri = input.modified.scheme === 'quickdiff-empty' ? input.original : input.modified;
  return vscode.workspace.asRelativePath(uri.fsPath, false);
}

function setSingle(value: boolean | undefined): Thenable<void> {
  return vscode.workspace
    .getConfiguration('quickdiff')
    .update('singleDiffEditor', value, vscode.ConfigurationTarget.Global);
}

/** The user's Keep Open / double-click: turns the active preview tab into a normal tab. */
async function pinActive(): Promise<void> {
  await run('workbench.action.keepEditor');
  await waitFor(() => vscode.window.tabGroups.activeTabGroup.activeTab?.isPreview === false);
}

const open = (path: string) => run('quickdiff.openFile', path);

describe('single diff editor setting', () => {
  beforeEach(async () => {
    await closeAllEditors();
    await resetToWorktree();
  });
  afterEach(async () => {
    await setSingle(undefined);
    await closeAllEditors();
  });
  after(resetToWorktree);

  it('replaces a pinned diff when on', async () => {
    await setSingle(true);
    await open('a.txt');
    await pinActive();
    await run('quickdiff.nextFile');
    assert.strictEqual(diffTabs().length, 1);
    assert.strictEqual(diffPath(activeDiffTab()), 'src/b.ts');
  });

  it('keeps a pinned diff when off', async () => {
    await open('a.txt');
    await pinActive();
    await run('quickdiff.nextFile');
    assert.strictEqual(diffTabs().length, 2);
  });

  it('replaces a preview diff when on', async () => {
    await setSingle(true);
    await open('a.txt');
    await run('quickdiff.nextFile');
    assert.strictEqual(diffTabs().length, 1);
  });

  it('leaves a diff with unsaved edits open', async () => {
    await setSingle(true);
    await open('a.txt');
    const editor = vscode.window.activeTextEditor;
    assert.ok(editor, 'the modified side is active');
    const document = editor.document;
    try {
      await editor.edit((edit) => edit.insert(new vscode.Position(0, 0), 'x'));
      await waitFor(() => activeDiffTab()?.isDirty === true);
      await run('quickdiff.nextFile');
      assert.strictEqual(diffTabs().length, 2);
    } finally {
      await vscode.window.showTextDocument(document);
      await run('workbench.action.files.revert');
      await waitFor(() => !document.isDirty);
    }
  });

  it('closes a diff opened in another mode', async () => {
    await setSingle(true);
    await open('a.txt');
    await pinActive();
    const model = await getModel();
    await model.setMode({ kind: 'branch', base: 'master' });
    await open('src/b.ts');
    assert.strictEqual(diffTabs().length, 1);
    assert.strictEqual(diffPath(activeDiffTab()), 'src/b.ts');
  });

  it('leaves an unrelated diff with the same modified side open', async () => {
    await setSingle(true);
    const model = await getModel();
    const a = model.files.find((file) => file.path === 'a.txt');
    const b = model.files.find((file) => file.path === 'src/b.ts');
    assert.ok(a && b);
    await run('vscode.diff', b.uri, a.uri, 'unrelated');
    await pinActive();
    await open('a.txt');
    assert.strictEqual(diffTabs().length, 2);
    assert.ok(allTabs().some((tab) => tab.label === 'unrelated'));
  });

  it('opens in the group that holds the QuickDiff diff', async () => {
    await setSingle(true);
    await open('a.txt');
    await run('workbench.action.newGroupRight');
    await waitFor(() => vscode.window.tabGroups.activeTabGroup.viewColumn === vscode.ViewColumn.Two);
    await open('src/b.ts');
    const tabs = diffTabs();
    assert.strictEqual(tabs.length, 1);
    assert.strictEqual(tabs[0].group.viewColumn, vscode.ViewColumn.One);
    assert.strictEqual(diffPath(activeDiffTab()), 'src/b.ts');
  });

  it('closes pinned diffs in every group', async () => {
    await open('a.txt');
    await pinActive();
    await run('workbench.action.newGroupRight');
    await waitFor(() => vscode.window.tabGroups.activeTabGroup.viewColumn === vscode.ViewColumn.Two);
    await open('src/b.ts');
    await pinActive();
    assert.strictEqual(diffTabs().length, 2);
    await setSingle(true);
    await run('quickdiff.nextFile');
    assert.strictEqual(diffTabs().length, 1);
  });

  it('leaves the multi-diff editor alone', async () => {
    await setSingle(true);
    await run('quickdiff.openAll');
    // Pinned so VS Code's own preview replacement does not take it; only QuickDiff's cleanup could.
    await pinActive();
    await open('a.txt');
    assert.ok(allTabs().some((tab) => tab.label.startsWith(MULTI_TITLE_PREFIX)));
    assert.strictEqual(diffTabs().length, 1);
  });
});

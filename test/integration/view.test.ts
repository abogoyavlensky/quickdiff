import * as assert from 'node:assert';
import * as vscode from 'vscode';
import { closeAllEditors, getApi, getModel, resetToWorktree, waitFor } from './helpers';

describe('changes view', () => {
  afterEach(closeAllEditors);
  after(resetToWorktree);

  it('lists the worktree changes', async () => {
    const { filesProvider } = await getApi();
    const model = await getModel();
    const children = (await filesProvider.getChildren()) ?? [];
    assert.deepStrictEqual(
      children.map((f) => f.path),
      model.files.map((f) => f.path),
    );
    assert.deepStrictEqual(children.map((f) => f.path), ['a.txt', 'src/b.ts', 'untracked.txt']);
  });

  it('renders a row with name, directory, status icon, and open command', async () => {
    const { filesProvider } = await getApi();
    const model = await getModel();
    const file = model.files.find((f) => f.path === 'src/b.ts')!;
    const item = await filesProvider.getTreeItem(file);
    assert.strictEqual(item.label, 'b.ts');
    assert.strictEqual(item.description, 'src');
    assert.ok(item.iconPath instanceof vscode.ThemeIcon);
    assert.strictEqual(item.iconPath.id, 'diff-modified');
    assert.strictEqual(item.command?.command, 'quickdiff.openFile');
    assert.strictEqual(item.resourceUri?.toString(), file.uri.toString());
  });

  it('shows the count and mode on the view', async () => {
    const { treeView } = await getApi();
    assert.strictEqual(treeView.badge?.value, 3);
    assert.strictEqual(treeView.description, 'working tree');
  });

  it('selects the file of the active diff', async () => {
    const { treeView } = await getApi();
    const model = await getModel();
    await vscode.commands.executeCommand('quickdiff.files.focus');
    await vscode.commands.executeCommand('quickdiff.openFile', model.files[1]);
    await waitFor(() => treeView.selection[0]?.path === 'src/b.ts');
  });

  it('updates description and badge when the mode changes', async () => {
    const { treeView } = await getApi();
    const model = await getModel();
    await model.setMode({ kind: 'branch', base: 'master' });
    assert.strictEqual(treeView.description, 'HEAD → master');
    assert.strictEqual(treeView.badge?.value, 3);
  });

  it('shows a message when there are no changes', async () => {
    const { treeView } = await getApi();
    const model = await getModel();
    await model.setMode({ kind: 'refs', from: 'master', to: 'master' });
    assert.strictEqual(treeView.message, 'No changes');
    assert.strictEqual(treeView.badge, undefined);
  });
});

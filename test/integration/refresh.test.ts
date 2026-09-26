import * as assert from 'node:assert';
import * as vscode from 'vscode';
import { getModel, listing, resetToWorktree, waitFor } from './helpers';

describe('auto-refresh', () => {
  let fresh: vscode.Uri;

  before(async () => {
    const model = await getModel();
    fresh = vscode.Uri.joinPath(model.repo.rootUri, 'fresh.txt');
  });

  afterEach(async () => {
    await vscode.workspace.fs.delete(fresh).then(undefined, () => undefined);
  });

  after(async () => {
    const model = await getModel();
    await resetToWorktree();
    await waitFor(() => !model.files.some((f) => f.path === 'fresh.txt'), 10000);
  });

  it('picks up working tree changes in worktree mode', async () => {
    const model = await getModel();
    await vscode.workspace.fs.writeFile(fresh, Buffer.from('fresh\n'));
    await waitFor(() => model.files.some((f) => f.path === 'fresh.txt'), 10000);
    await vscode.workspace.fs.delete(fresh);
    await waitFor(() => !model.files.some((f) => f.path === 'fresh.txt'), 10000);
  });

  it('settles instead of refreshing in a loop while idle', async () => {
    const model = await getModel();
    await model.refresh();
    await new Promise((resolve) => setTimeout(resolve, 1000));
    let changes = 0;
    const subscription = model.onDidChange(() => changes++);
    try {
      await new Promise((resolve) => setTimeout(resolve, 1500));
      assert.ok(changes <= 1, `${changes} refreshes while idle`);
    } finally {
      subscription.dispose();
    }
  });

  it('leaves the refs list alone when the working tree changes', async () => {
    const model = await getModel();
    await model.setMode({ kind: 'refs', from: 'master~1', to: 'master' });
    const before = listing(model);
    let changes = 0;
    const subscription = model.onDidChange(() => changes++);
    try {
      await vscode.workspace.fs.writeFile(fresh, Buffer.from('fresh\n'));
      await new Promise((resolve) => setTimeout(resolve, 1500));
      assert.deepStrictEqual(listing(model), before);
      assert.strictEqual(changes, 0);
    } finally {
      subscription.dispose();
    }
  });
});

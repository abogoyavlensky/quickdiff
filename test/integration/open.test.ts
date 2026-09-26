import * as assert from 'node:assert';
import * as vscode from 'vscode';
import { activeDiffTab, closeAllEditors, getModel, resetToWorktree } from './helpers';

function diffInput(): vscode.TabInputTextDiff {
  const input = activeDiffTab()?.input;
  assert.ok(input instanceof vscode.TabInputTextDiff, 'active tab is a text diff');
  return input;
}

function cursorLine(): number | undefined {
  return vscode.window.activeTextEditor?.selection.active.line;
}

async function open(path: string, opts?: { hunk: 'first' | 'last' }) {
  const model = await getModel();
  const file = model.files.find((f) => f.path === path);
  assert.ok(file, `${path} is listed`);
  await vscode.commands.executeCommand('quickdiff.openFile', file, opts);
  return file;
}

describe('opening a file', () => {
  afterEach(closeAllEditors);
  after(resetToWorktree);

  it('opens a worktree change at its first hunk', async () => {
    const file = await open('a.txt');
    const input = diffInput();
    assert.strictEqual(input.original.scheme, 'git');
    assert.strictEqual(input.modified.toString(), file.uri.toString());
    assert.strictEqual(cursorLine(), 8);
  });

  it('opens an untracked file against an empty document', async () => {
    const file = await open('untracked.txt');
    const input = diffInput();
    assert.strictEqual(input.original.scheme, 'quickdiff-empty');
    assert.strictEqual(input.modified.toString(), file.uri.toString());
    assert.strictEqual(cursorLine(), 0);
  });

  it('uses empty sides for deleted and added files in branch mode', async () => {
    const model = await getModel();
    await model.setMode({ kind: 'branch', base: 'master' });

    await open('deleted.txt');
    let input = diffInput();
    assert.strictEqual(input.original.scheme, 'git');
    assert.strictEqual(input.modified.scheme, 'quickdiff-empty');

    await open('new.txt');
    input = diffInput();
    assert.strictEqual(input.original.scheme, 'quickdiff-empty');
    assert.strictEqual(input.modified.scheme, 'git');
  });

  it('opens at the last hunk on request', async () => {
    const model = await getModel();
    await model.setMode({ kind: 'branch', base: 'master' });
    await open('src/b.ts', { hunk: 'last' });
    assert.strictEqual(cursorLine(), 14);
  });
});

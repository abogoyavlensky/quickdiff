import * as assert from 'node:assert';
import * as vscode from 'vscode';
import { formatOpenUrl, parseOpenQuery, type OpenRequest } from '../../src/core/mode';
import { activeDiffTab, closeAllEditors, getApi, getModel, resetToWorktree } from './helpers';

function openUri(request: OpenRequest): vscode.Uri {
  return vscode.Uri.parse(formatOpenUrl(request));
}

describe('open requests via uri', () => {
  let cwd: string;

  before(async () => {
    cwd = (await getModel()).repositoryRoot;
  });
  beforeEach(closeAllEditors);
  after(async () => {
    await closeAllEditors();
    await resetToWorktree();
  });

  it('applies a branch request: sets the mode, shows the list, opens the first file', async () => {
    const api = await getApi();
    await api.handleUri(openUri({ cwd, mode: { kind: 'branch', base: 'master' }, view: 'file' }));
    assert.deepStrictEqual(api.model?.mode, { kind: 'branch', base: 'master' });
    const input = activeDiffTab()?.input;
    assert.ok(input instanceof vscode.TabInputTextDiff);
    assert.ok(input.original.path.endsWith('/deleted.txt'), input.original.toString());
    assert.strictEqual(api.treeView.visible, true);
  });

  it('opens the multi-diff editor for view=all from a subdirectory', async () => {
    const api = await getApi();
    await api.handleUri(openUri({ cwd: cwd + '/src', mode: { kind: 'worktree' }, view: 'all' }));
    assert.ok(activeDiffTab()?.label.startsWith('QuickDiff: '), activeDiffTab()?.label);
  });

  it('delivers reserved characters in values intact through VS Code uri parsing', () => {
    const request: OpenRequest = {
      cwd: '/tmp/a+b&c=d e%f',
      mode: { kind: 'refs', from: 'feature/a+b', to: 'v1.0#x' },
      view: 'all',
    };
    assert.deepStrictEqual(parseOpenQuery(openUri(request).query), request);
  });

  it('ignores a malformed request', async () => {
    const api = await getApi();
    const mode = api.model?.mode;
    await api.handleUri(vscode.Uri.parse('vscode://abogoyavlensky.quickdiff/open?mode=branch'));
    await api.handleUri(vscode.Uri.parse('vscode://abogoyavlensky.quickdiff/other?cwd=%2Frepo&mode=worktree'));
    assert.deepStrictEqual(api.model?.mode, mode);
  });
});

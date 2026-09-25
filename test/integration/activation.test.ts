import * as assert from 'node:assert';
import * as vscode from 'vscode';
import { EXTENSION_ID, getApi } from './helpers';

describe('activation', () => {
  it('activates alongside the git extension in the fixture workspace', async () => {
    await getApi();
    assert.ok(vscode.extensions.getExtension(EXTENSION_ID)?.isActive);
    assert.ok(vscode.extensions.getExtension('vscode.git')?.isActive);
    const folder = vscode.workspace.workspaceFolders?.[0];
    assert.ok(folder?.uri.fsPath.endsWith('fixture-repo'));
  });
});

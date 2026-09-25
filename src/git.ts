import * as vscode from 'vscode';
import type { API, GitExtension, Repository } from './gitTypes';

export async function getGitApi(): Promise<API> {
  const extension = vscode.extensions.getExtension<GitExtension>('vscode.git');
  if (!extension) {
    throw new Error('The built-in git extension is not available');
  }
  const exports = await extension.activate();
  const api = exports.getAPI(1);
  if (api.state !== 'initialized') {
    await new Promise<void>((resolve) => {
      const subscription = api.onDidChangeState((state) => {
        if (state === 'initialized') {
          subscription.dispose();
          resolve();
        }
      });
    });
  }
  return api;
}

export function waitForRepository(api: API, folderUri: vscode.Uri, timeoutMs = 10000): Promise<Repository> {
  const existing = api.getRepository(folderUri);
  if (existing) {
    return Promise.resolve(existing);
  }
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      subscription.dispose();
      reject(new Error(`No git repository found for ${folderUri.fsPath}`));
    }, timeoutMs);
    const subscription = api.onDidOpenRepository((repo) => {
      if (isInside(folderUri.fsPath, repo.rootUri.fsPath)) {
        clearTimeout(timer);
        subscription.dispose();
        resolve(repo);
      }
    });
  });
}

function isInside(path: string, root: string): boolean {
  const normalizedRoot = root.endsWith('/') ? root : root + '/';
  return path === root || path.startsWith(normalizedRoot);
}

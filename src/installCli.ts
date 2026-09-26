import { chmod, copyFile, mkdir } from 'node:fs/promises';
import { homedir } from 'node:os';
import * as path from 'node:path';
import * as vscode from 'vscode';

/** Copies the bundled `bin/qd` script to `~/.local/bin/qd`. */
export async function installCli(context: vscode.ExtensionContext): Promise<void> {
  if (process.platform === 'win32') {
    void vscode.window.showWarningMessage('The qd script is not supported on Windows yet.');
    return;
  }
  const targetDir = path.join(homedir(), '.local', 'bin');
  const target = path.join(targetDir, 'qd');
  await mkdir(targetDir, { recursive: true });
  await copyFile(context.asAbsolutePath('bin/qd'), target);
  await chmod(target, 0o755);
  void vscode.window.showInformationMessage(`Installed qd to ${target}. Make sure it is on your PATH.`);
}

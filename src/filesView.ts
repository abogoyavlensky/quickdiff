import * as path from 'node:path';
import * as vscode from 'vscode';
import type { FileChange, FileStatus } from './core/files';
import { modeLabel } from './core/mode';
import type { ChangesModel } from './model';
import { currentIndex } from './navigation';

const STATUS_ICONS: Record<FileStatus, string> = {
  added: 'diff-added',
  untracked: 'diff-added',
  modified: 'diff-modified',
  deleted: 'diff-removed',
  renamed: 'diff-renamed',
};

export class FilesProvider implements vscode.TreeDataProvider<FileChange> {
  private readonly changeEmitter = new vscode.EventEmitter<void>();
  readonly onDidChangeTreeData = this.changeEmitter.event;
  model: ChangesModel | undefined;

  getChildren(element?: FileChange): FileChange[] {
    return element || !this.model ? [] : this.model.files;
  }

  getParent(): undefined {
    return undefined;
  }

  getTreeItem(file: FileChange): vscode.TreeItem {
    const item = new vscode.TreeItem(path.posix.basename(file.path));
    const dir = path.posix.dirname(file.path);
    item.id = file.path;
    item.description = dir === '.' ? undefined : dir;
    item.iconPath = new vscode.ThemeIcon(STATUS_ICONS[file.status]);
    item.resourceUri = file.uri;
    item.tooltip = `${file.path} (${file.status})`;
    item.command = { command: 'quickdiff.openFile', title: 'Open Change', arguments: [file.path] };
    return item;
  }

  refresh(): void {
    this.changeEmitter.fire();
  }

  dispose(): void {
    this.changeEmitter.dispose();
  }
}

export interface FilesView {
  provider: FilesProvider;
  treeView: vscode.TreeView<FileChange>;
  /** Binds the view to a model once repository discovery succeeds. */
  attach(model: ChangesModel): void;
}

/** Created at activation, before repository discovery, so the welcome view works without a model. */
export function createFilesView(context: vscode.ExtensionContext): FilesView {
  const provider = new FilesProvider();
  const treeView = vscode.window.createTreeView('quickdiff.files', { treeDataProvider: provider });
  context.subscriptions.push(provider, treeView);

  const attach = (model: ChangesModel) => {
    provider.model = model;
    const update = () => {
      const count = model.files.length;
      provider.refresh();
      treeView.description = modeLabel(model.mode);
      treeView.badge = count ? { value: count, tooltip: `${count} changed files` } : undefined;
      treeView.message = count ? undefined : 'No changes';
      followActiveEditor();
    };
    const followActiveEditor = () => {
      const index = currentIndex(model);
      const file = index === undefined ? undefined : model.files[index];
      if (file && treeView.visible && treeView.selection[0]?.path !== file.path) {
        treeView.reveal(file, { select: true, focus: false }).then(undefined, () => undefined);
      }
    };
    context.subscriptions.push(
      model.onDidChange(update),
      vscode.window.onDidChangeActiveTextEditor(followActiveEditor),
      vscode.window.tabGroups.onDidChangeTabs(followActiveEditor),
      treeView.onDidChangeVisibility(followActiveEditor),
    );
    update();
  };

  return { provider, treeView, attach };
}

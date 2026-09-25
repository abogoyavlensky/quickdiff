import * as vscode from 'vscode';
import { sortFiles, toFileChange, type FileChange } from './core/files';
import { parseHunkLines } from './core/hunks';
import type { DiffMode } from './core/mode';
import { GitStatus, type API, type Change, type Repository } from './gitTypes';

export interface ResolvedRefs {
  left: string;
  right: string | 'worktree';
}

const MODE_KEY = 'quickdiff.mode';

export class ChangesModel implements vscode.Disposable {
  readonly repositoryRoot: string;
  mode: DiffMode;
  resolved: ResolvedRefs = { left: 'HEAD', right: 'worktree' };
  files: FileChange[] = [];

  private readonly changeEmitter = new vscode.EventEmitter<void>();
  readonly onDidChange = this.changeEmitter.event;
  private sequence = 0;
  private hunkCache = new Map<string, Promise<number[]>>();

  constructor(
    readonly api: API,
    readonly repo: Repository,
    private readonly workspaceState: vscode.Memento,
  ) {
    this.repositoryRoot = repo.rootUri.fsPath;
    this.mode = workspaceState.get<DiffMode>(MODE_KEY) ?? { kind: 'worktree' };
  }

  async setMode(mode: DiffMode): Promise<void> {
    if (await this.load(mode)) {
      await this.workspaceState.update(MODE_KEY, mode);
    }
  }

  async refresh(): Promise<void> {
    await this.load(this.mode);
  }

  /** Loads the list for `mode`; commits it only if no newer load started meanwhile. */
  private async load(mode: DiffMode): Promise<boolean> {
    const sequence = ++this.sequence;
    const { resolved, changes } = await this.listChanges(mode);
    if (sequence !== this.sequence) {
      return false;
    }
    this.mode = mode;
    this.resolved = resolved;
    this.files = sortFiles(changes.map((change) => toFileChange(change, this.repositoryRoot)));
    this.hunkCache.clear();
    this.changeEmitter.fire();
    return true;
  }

  private async listChanges(mode: DiffMode): Promise<{ resolved: ResolvedRefs; changes: Change[] }> {
    switch (mode.kind) {
      case 'worktree': {
        await this.repo.status();
        // diffWith('HEAD') is `git diff HEAD` (staged + unstaged); diffWithHEAD() is only unstaged.
        const tracked = await this.repo.diffWith('HEAD');
        const untracked = [...this.repo.state.workingTreeChanges, ...this.repo.state.untrackedChanges].filter(
          (change) => (change.status as number) === GitStatus.UNTRACKED,
        );
        return { resolved: { left: 'HEAD', right: 'worktree' }, changes: [...tracked, ...untracked] };
      }
      case 'branch': {
        const mergeBase = await this.repo.getMergeBase(mode.base, 'HEAD');
        if (!mergeBase) {
          throw new Error(`No merge base between ${mode.base} and HEAD`);
        }
        return { resolved: { left: mergeBase, right: 'HEAD' }, changes: await this.repo.diffBetween(mergeBase, 'HEAD') };
      }
      case 'refs':
        return { resolved: { left: mode.from, right: mode.to }, changes: await this.repo.diffBetween(mode.from, mode.to) };
    }
  }

  hunksFor(file: FileChange): Promise<number[]> {
    if (file.status === 'untracked' || file.status === 'added' || file.status === 'deleted') {
      return Promise.resolve([1]);
    }
    let hunks = this.hunkCache.get(file.path);
    if (!hunks) {
      const { left, right } = this.resolved;
      const diff =
        right === 'worktree'
          ? this.repo.diffWith('HEAD', file.uri.fsPath)
          : this.repo.diffBetween(left, right, file.uri.fsPath);
      hunks = diff.then(parseHunkLines);
      hunks.catch(() => this.hunkCache.delete(file.path));
      this.hunkCache.set(file.path, hunks);
    }
    return hunks;
  }

  /** Base branch for branch mode: setting, else `main`, else `master`, else undefined (caller asks). */
  async resolveBase(): Promise<string | undefined> {
    const configured = vscode.workspace.getConfiguration('quickdiff').get<string>('baseBranch');
    if (configured) {
      return configured;
    }
    const branches = await this.repo.getBranches({ remote: false });
    const names = new Set(branches.map((branch) => branch.name));
    return ['main', 'master'].find((name) => names.has(name));
  }

  dispose(): void {
    this.changeEmitter.dispose();
  }
}

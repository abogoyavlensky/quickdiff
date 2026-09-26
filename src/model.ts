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
const AUTO_REFRESH_DELAY_MS = 300;

export class ChangesModel implements vscode.Disposable {
  readonly repositoryRoot: string;
  mode: DiffMode;
  resolved: ResolvedRefs = { left: 'HEAD', right: 'worktree' };
  files: FileChange[] = [];

  private readonly changeEmitter = new vscode.EventEmitter<void>();
  readonly onDidChange = this.changeEmitter.event;
  private sequence = 0;
  private hunkCache = new Map<string, Promise<number[]>>();
  /** The latest requested mode; differs from `mode` while a setMode is in flight. */
  private target: DiffMode;
  private autoRefreshTimer: NodeJS.Timeout | undefined;
  private readonly subscriptions: vscode.Disposable[] = [];

  constructor(
    readonly api: API,
    readonly repo: Repository,
    private readonly workspaceState: vscode.Memento,
    private readonly log: (message: string) => void = () => undefined,
  ) {
    this.repositoryRoot = repo.rootUri.fsPath;
    this.mode = workspaceState.get<DiffMode>(MODE_KEY) ?? { kind: 'worktree' };
    this.target = this.mode;
    this.subscriptions.push(repo.state.onDidChange(() => this.scheduleAutoRefresh()));
  }

  async setMode(mode: DiffMode): Promise<void> {
    this.target = mode;
    try {
      if (await this.load(mode, true)) {
        await this.workspaceState.update(MODE_KEY, mode);
      }
    } catch (error) {
      if (this.target === mode) {
        this.target = this.mode;
      }
      throw error;
    }
  }

  async refresh(): Promise<void> {
    await this.load(this.target, true);
  }

  /**
   * Working tree lists follow repository state changes. The auto path skips `repo.status()`,
   * which would itself fire a state change and refresh forever.
   */
  private scheduleAutoRefresh(): void {
    clearTimeout(this.autoRefreshTimer);
    this.autoRefreshTimer = setTimeout(() => {
      const mode = this.target;
      if (mode.kind !== 'worktree') {
        return;
      }
      this.load(mode, false).catch((error) =>
        this.log(`Auto-refresh failed: ${error instanceof Error ? error.message : String(error)}`),
      );
    }, AUTO_REFRESH_DELAY_MS);
  }

  /** Loads the list for `mode`; commits it only if no newer load started meanwhile. */
  private async load(mode: DiffMode, updateStatus: boolean): Promise<boolean> {
    const sequence = ++this.sequence;
    const { resolved, changes } = await this.listChanges(mode, updateStatus);
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

  private async listChanges(
    mode: DiffMode,
    updateStatus: boolean,
  ): Promise<{ resolved: ResolvedRefs; changes: Change[] }> {
    switch (mode.kind) {
      case 'worktree': {
        if (updateStatus) {
          await this.repo.status();
        }
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
      case 'refs': {
        // The git API only offers `git diff from...to`, so the left side is the merge base to
        // keep the list, hunks, and diff sides consistent. Same as `from` when it is an ancestor.
        const mergeBase = await this.repo.getMergeBase(mode.from, mode.to);
        if (!mergeBase) {
          throw new Error(`No merge base between ${mode.from} and ${mode.to}`);
        }
        return { resolved: { left: mergeBase, right: mode.to }, changes: await this.repo.diffBetween(mergeBase, mode.to) };
      }
    }
  }

  hunksFor(file: FileChange): Promise<number[]> {
    const wholeFile =
      file.status === 'untracked' ||
      file.status === 'added' ||
      file.status === 'deleted' ||
      // The working tree side of a rename is not a blob, so there is nothing to diff it against.
      (file.status === 'renamed' && this.mode.kind === 'worktree');
    if (wholeFile) {
      return Promise.resolve([1]);
    }
    let hunks = this.hunkCache.get(file.path);
    if (!hunks) {
      hunks = this.diffText(file).then(parseHunkLines);
      hunks.catch(() => this.hunkCache.delete(file.path));
      this.hunkCache.set(file.path, hunks);
    }
    return hunks;
  }

  private async diffText(file: FileChange): Promise<string> {
    if (this.mode.kind === 'worktree') {
      return this.repo.diffWith('HEAD', file.uri.fsPath);
    }
    const { left, right } = this.resolved;
    if (file.status === 'renamed') {
      // A path-limited diff would see only the new path and report the whole file as added.
      const [before, after] = await Promise.all([
        this.repo.getObjectDetails(left, file.originalUri.fsPath),
        this.repo.getObjectDetails(right, file.uri.fsPath),
      ]);
      return this.repo.diffBlobs(before.object, after.object);
    }
    return this.repo.diffBetween(left, right, file.uri.fsPath);
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
    clearTimeout(this.autoRefreshTimer);
    this.subscriptions.forEach((subscription) => subscription.dispose());
    this.changeEmitter.dispose();
  }
}

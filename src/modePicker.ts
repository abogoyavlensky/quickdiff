import * as vscode from 'vscode';
import type { DiffMode } from './core/mode';
import type { ChangesModel } from './model';

interface RefItem extends vscode.QuickPickItem {
  /** The ref to use; undefined for the "type a ref" item. */
  ref?: string;
}

const TYPE_REF: RefItem = { label: '$(edit) Type a ref…', alwaysShow: true };

/** Lets the user choose a mode and its refs; Escape at any step leaves the mode unchanged. */
export async function pickMode(model: ChangesModel): Promise<void> {
  const current = model.mode.kind;
  const mark = (kind: DiffMode['kind'], label: string) => (current === kind ? `$(check) ${label}` : label);
  const choice = await vscode.window.showQuickPick(
    [
      { label: mark('worktree', 'Working tree'), mode: 'worktree' as const, detail: 'Uncommitted changes against HEAD' },
      { label: mark('branch', 'Branch against base…'), mode: 'branch' as const, detail: 'Committed changes since the merge base' },
      { label: mark('refs', 'Two refs…'), mode: 'refs' as const, detail: 'Changes between two branches, tags, or commits' },
    ],
    { title: 'QuickDiff: Pick Mode' },
  );
  if (!choice) {
    return;
  }
  const mode = await pickModeParams(model, choice.mode);
  if (mode) {
    await model.setMode(mode);
  }
}

async function pickModeParams(model: ChangesModel, kind: DiffMode['kind']): Promise<DiffMode | undefined> {
  switch (kind) {
    case 'worktree':
      return { kind: 'worktree' };
    case 'branch': {
      const active = model.mode.kind === 'branch' ? model.mode.base : await model.resolveBase();
      const base = await pickRef('Base branch', await branchItems(model), active);
      return base ? { kind: 'branch', base } : undefined;
    }
    case 'refs': {
      const items = [...(await branchItems(model)), ...(await commitItems(model))];
      const from = await pickRef('Compare from', items, model.mode.kind === 'refs' ? model.mode.from : undefined);
      if (!from) {
        return undefined;
      }
      const to = await pickRef(`Compare ${from} to`, items, model.mode.kind === 'refs' ? model.mode.to : undefined);
      return to ? { kind: 'refs', from, to } : undefined;
    }
  }
}

async function branchItems(model: ChangesModel): Promise<RefItem[]> {
  const branches = await model.repo.getBranches({ remote: false });
  return branches
    .filter((branch) => branch.name)
    .map((branch) => ({ label: `$(git-branch) ${branch.name}`, ref: branch.name }));
}

async function commitItems(model: ChangesModel): Promise<RefItem[]> {
  const commits = await model.repo.log({ maxEntries: 30 });
  const separator: RefItem = { label: 'Recent commits', kind: vscode.QuickPickItemKind.Separator };
  return [
    separator,
    ...commits.map((commit) => ({
      label: `${commit.hash.slice(0, 7)}  ${commit.message.split('\n')[0]}`,
      ref: commit.hash,
    })),
  ];
}

/** Quick pick over refs with an optional preselected ref; "Type a ref…" opens an input box. */
function pickRef(title: string, items: RefItem[], active?: string): Promise<string | undefined> {
  return new Promise((resolve) => {
    const quickPick = vscode.window.createQuickPick<RefItem>();
    quickPick.title = title;
    quickPick.placeholder = 'Select a ref';
    quickPick.items = [TYPE_REF, ...items];
    const activeItem = items.find((item) => item.ref !== undefined && item.ref === active);
    if (activeItem) {
      quickPick.activeItems = [activeItem];
    }
    let picked: RefItem | undefined;
    quickPick.onDidAccept(() => {
      picked = quickPick.selectedItems[0];
      quickPick.hide();
    });
    quickPick.onDidHide(async () => {
      quickPick.dispose();
      if (picked === TYPE_REF) {
        const typed = await vscode.window.showInputBox({ title, prompt: 'Branch, tag, or commit' });
        resolve(typed?.trim() || undefined);
      } else {
        resolve(picked?.ref);
      }
    });
    quickPick.show();
  });
}

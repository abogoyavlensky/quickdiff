# Single Diff Editor Implementation Plan

> **For agentic workers:** Use executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** An opt-in setting, `quickdiff.singleDiffEditor`, that keeps exactly one QuickDiff diff tab open: opening a file's diff closes every other QuickDiff diff tab, pinned or not, in every editor group, except tabs with unsaved edits.

**Tech Stack:** TypeScript extension over the VS Code tab-groups API (`vscode.window.tabGroups`), Mocha inside a headless VS Code for integration tests. Tasks run with `rite` (`rite.edn`).

---

## Design

### Why

`openFile` (`src/opener.ts`) opens every diff with `{ preview: true }` and relies on VS Code's preview tab to replace the previous diff. VS Code ignores that flag when `workbench.editor.enablePreview` is false, stops replacing a tab once the user pins it (double-click, Keep Open, or an edit), and keeps one preview tab per editor group. So with the common "no preview tabs" setup, stepping through files with Next File piles up one diff tab per file. The preview flag cannot guarantee a single diff editor; only the extension can, by closing the tabs it opened.

Closing tabs the user may have pinned is not standard VS Code behaviour, so it is opt-in. The default stays what it is today.

### The setting

```json
"quickdiff.singleDiffEditor": {
  "type": "boolean",
  "default": false,
  "description": "Keep only one QuickDiff diff open. Opening a change closes the other QuickDiff diff tabs, even pinned ones, in every editor group. Tabs with unsaved edits stay open. The multi-diff editor from Open All is not affected."
}
```

Read with `vscode.workspace.getConfiguration('quickdiff').get<boolean>('singleDiffEditor', false)` on every `openFile` call, the same way `baseBranch` is read in `src/model.ts:196`. No caching, so a change applies to the next open.

### Recognising QuickDiff diff tabs

A new module `src/tabs.ts` owns the question "is this tab a QuickDiff diff of this model?". There are two different strictness levels, because the two callers have different costs of being wrong:

- **Navigation** (`activeContext`, `src/navigation.ts:14-23`) matches one side: the right side for every status except deleted, whose right side is the shared empty document, so deleted files match on the left side. Being lenient here is harmless and useful: a diff of a listed file opened from the Git view still lets Next File continue from it. This loop moves to `src/tabs.ts` unchanged and navigation calls it.
- **Cleanup** closes tabs, so it must match **both sides exactly**. A diff from the Git view, GitLens, or "Compare with Selected" can share the modified URI with a QuickDiff diff while comparing against a different original. One-side matching would close it, pinned or not. A tab is a QuickDiff diff for cleanup when its `TabInputTextDiff` input's `(original, modified)` pair equals either:
  1. **A listed file's sides**: `sidesOf(model, file)` for some file in `model.files`, both URIs compared as strings.
  2. **A pair opened this session**: a module-level `Set<string>` of `${left}\n${right}` keys recorded by `openFile` each time it runs `vscode.diff`. This catches tabs whose file is no longer listed, most commonly after a mode switch (`qd` then `qd main`): the working tree diff of `a.txt` has `file.uri` on the right, the branch diff has a `git:` URI, so the list alone would not recognise the old tab and it would survive. The set lives for the session; tabs restored after a window reload are covered by source 1 as long as the file is still listed.

A Git view diff of a working tree change has exactly the same sides as QuickDiff's worktree diff (`git:` HEAD against the file), so it is indistinguishable and gets closed too. That is acceptable: it shows the same thing.

The multi-diff tab from Open All has a `TabInputTextMultiDiff` input, not `TabInputTextDiff`, so it never matches. Plain text editors of changed files never match either.

Exported API of `src/tabs.ts`:

```ts
/** `${original}\n${modified}`, the key both the opened set and the pair comparison use. */
export function diffKey(original: vscode.Uri, modified: vscode.Uri): string;

/**
 * Index of the listed file shown by `tab`, matching one side only (right, or left for
 * deleted files). For navigation; too lenient for closing tabs.
 */
export function listedFileIndex(model: ChangesModel, tab: vscode.Tab): number | undefined;

/** Records that QuickDiff opened a diff with these sides; used to recognise the tab later. */
export function rememberOpened(left: vscode.Uri, right: vscode.Uri): void;

/**
 * Every QuickDiff diff tab in every group, matched on both sides: a listed file's exact
 * sides, or a pair opened this session. Safe to close.
 */
export function quickDiffTabs(model: ChangesModel): vscode.Tab[];
```

`activeContext` keeps its shape and uses `listedFileIndex` for the `TabInputTextDiff` branch, which removes the duplicated matching loop.

### Opening with the setting on

`openFile` becomes, in order:

1. Compute `sides` as today.
2. If the setting is on, find the existing QuickDiff tabs with `quickDiffTabs(model)`. If any, take the first one's `group.viewColumn` as the target column. This keeps the diff in the group where the user reviews instead of whichever group has focus. If none, the active column is used, as today.
3. `rememberOpened(left, right)`, then run `vscode.diff` with `{ preview: true, viewColumn }` (`viewColumn` only when the setting is on and a target was found). `preview: true` stays in both modes: when VS Code honours it, it replaces the preview tab itself and step 4 finds nothing to close.
4. If the setting is on, close the other QuickDiff tabs: every tab from `quickDiffTabs(model)` that is not the tab just opened and is not `isDirty`, with `vscode.window.tabGroups.close(tabs, true)` (`preserveFocus` true, so focus stays on the new diff). "The tab just opened" is the active tab of the active group; a tab is "the same" when its `group.viewColumn` and its diff input's `original` and `modified` strings match. Comparing by identity is not safe: the API does not promise stable `Tab` objects.
5. Cursor placement on the chosen hunk, unchanged.

Opening before closing is deliberate. Closing first can leave a group empty, which VS Code then removes, and the new diff lands in a different group with a visible flicker. Opening first means the close is at most a tab vanishing beside the new one.

Dirty tabs are skipped because closing them prompts to save, which would interrupt Next File in working tree mode, where the right side is the real file. The README states this limit.

With the setting off, nothing changes: no `viewColumn`, no closing. `rememberOpened` runs in both modes; it is a cheap set insert and means turning the setting on mid-session also catches tabs opened before.

### Navigation and the files view

Unchanged. `activeContext` recognises the new diff as before, so Next File and Next Change work from it, and the Changes list keeps following the active editor.

### Docs

README: a row in the Settings table. CHANGELOG: a line under `## Unreleased`. The version is bumped at release time, not here.

### Testing

Integration tests in a new `test/integration/singleEditor.test.ts`, run in the same headless VS Code as the others. Each test sets the setting with `vscode.workspace.getConfiguration('quickdiff').update('singleDiffEditor', <value>, vscode.ConfigurationTarget.Global)`; `afterEach` resets it to `undefined` and closes all editors. The user-data directory is recreated on every run (`.vscode-test.mjs`), so nothing leaks between runs.

Helpers in the test file:

- `quickDiffTabCount()`: number of tabs across `vscode.window.tabGroups.all` whose input is a `TabInputTextDiff`.
- `pinActive()`: `workbench.action.keepEditor`, which turns the active preview tab into a normal tab. This is the user's Keep Open / double-click.

Cases:

| Case | Setting | Steps | Expect |
|------|---------|-------|--------|
| pinned tab is replaced | on | open `a.txt`, `pinActive()`, `quickdiff.nextFile` | one diff tab, showing `src/b.ts` |
| pinned tab stays without the setting | off | same steps | two diff tabs (today's behaviour) |
| preview tab is replaced | on | open `a.txt`, `quickdiff.nextFile` | one diff tab (VS Code's own replacement still works) |
| dirty tab stays open | on | open `a.txt` (worktree, right side is the file), insert a character through `activeTextEditor.edit`, wait until the active tab `isDirty`, `quickdiff.nextFile` | two diff tabs. Revert in a `finally`: run `workbench.action.files.revert` with the dirty document's editor active and wait until no tab `isDirty`, so a failed assertion cannot leave an unsaved editor that makes `closeAllEditors` prompt and block the following tests |
| other mode's tab is closed | on | worktree: open `a.txt`, `pinActive()`; `setMode({ kind: 'branch', base: 'master' })`; open `src/b.ts` | one diff tab, showing `src/b.ts` (the opened-pairs set recognised the worktree tab) |
| unrelated diff with the same modified side stays open | on | `vscode.diff(<uri of src/b.ts>, <uri of a.txt>, 'unrelated')`, `pinActive()`; open `a.txt` through `quickdiff.openFile` | two diff tabs; the one labelled `unrelated` still exists (its original differs, so both-sides matching does not claim it) |
| stays in the reviewing group | on | open `a.txt`, `workbench.action.newGroupRight` (focus moves to an empty second group), `quickdiff.nextFile` | one diff tab, in `vscode.ViewColumn.One`, and it is the active tab |
| pinned tabs in every group are closed | on | open `a.txt`, `pinActive()`; `workbench.action.newGroupRight`; open `src/b.ts` with the setting **off**, `pinActive()` (now one pinned diff per group); turn the setting on; `quickdiff.nextFile` | one diff tab in total, across all groups |
| multi-diff tab is left alone | on | `quickdiff.openAll`, then open `a.txt` | the tab whose label starts with `QuickDiff: ` still exists, plus one diff tab |

Existing tests keep passing: `open.test.ts` and `navigation.test.ts` run with the setting unset, which is off.

Not tested: `workbench.editor.enablePreview` false. The pinned-tab case exercises the same code path (VS Code does not replace the tab, the extension closes it) without changing a workbench setting the other test files assume.

## File Structure

- Modify: `package.json` — the `quickdiff.singleDiffEditor` setting.
- Create: `src/tabs.ts` — recognising QuickDiff diff tabs: `listedFileIndex`, `rememberOpened`, `quickDiffTabs`.
- Modify: `src/navigation.ts` — `activeContext` uses `listedFileIndex`.
- Modify: `src/opener.ts` — `openFile` reads the setting, targets the reviewing group, records the pair, closes the other QuickDiff tabs.
- Create: `test/integration/singleEditor.test.ts` — the cases above.
- Modify: `README.md` — Settings table row.
- Modify: `CHANGELOG.md` — Unreleased entry.

## Tasks

### Task 1: Tab recognition module

**Files:**
- Create: `src/tabs.ts`
- Modify: `src/navigation.ts`

- [ ] **Step 1: Create `src/tabs.ts`**
  Implement the four exports from the design. `listedFileIndex` holds the loop that is now inside `activeContext` (`src/navigation.ts:14-23`), including the deleted-file rule. `quickDiffTabs` flattens `vscode.window.tabGroups.all` and keeps tabs with a `TabInputTextDiff` input whose `diffKey(original, modified)` is either in the opened set or equal to `diffKey(left, right)` of `sidesOf(model, file)` for some listed file. It must not use `listedFileIndex`: one-side matching is for navigation only. Import `sidesOf` from `./opener`; `src/opener.ts` will import `./tabs` in Task 2, so keep the import type-only where possible to avoid a runtime cycle, or export `sidesOf` from `src/sides.ts`-level code if the cycle bites (it should not: both imports are used inside functions, not at module load).

- [ ] **Step 2: Use it in `activeContext`**
  Replace the inline `findIndex` loop with `listedFileIndex(model, tab)`. Behaviour is identical.

- [ ] **Step 3: Compile and run the existing integration tests**
  Run: `rite test-it`
  Expected: all current tests pass, no new tests yet.

- [ ] **Step 4: Commit**
  `git commit -m "refactor: move QuickDiff diff tab recognition to src/tabs.ts"`

### Task 2: Setting and opener behaviour

**Files:**
- Modify: `package.json`
- Modify: `src/opener.ts`
- Create: `test/integration/singleEditor.test.ts`

- [ ] **Step 1: Add the setting to `package.json`**
  Under `contributes.configuration.properties`, after `quickdiff.baseBranch`, add `quickdiff.singleDiffEditor` with the type, default, and description from the design.

- [ ] **Step 2: Write the failing tests**
  Create `test/integration/singleEditor.test.ts` with the helpers and the nine cases from the Testing section. Follow `open.test.ts` for structure (`getModel`, `closeAllEditors`, `resetToWorktree`, `waitFor` from `./helpers`). For the dirty case, revert before `afterEach` runs: run `workbench.action.files.revert` with the dirty document's editor active, then `waitFor(() => !tab.isDirty)`.

- [ ] **Step 3: Run the tests to see the new ones fail**
  Run: `rite test-it`
  Expected: the "pinned tab is replaced", "other mode's tab is closed", and "stays in the reviewing group" cases fail; the rest pass (the unrelated-diff case passes before and after, it guards the implementation).

- [ ] **Step 4: Implement the opener change**
  In `openFile`, follow the five steps from "Opening with the setting on". Keep `OpenOptions` unchanged. Put the "same tab" comparison in a small local function. Pass `preserveFocus: true` to `tabGroups.close`.

- [ ] **Step 5: Run all integration tests**
  Run: `rite test-it`
  Expected: PASS, including `open.test.ts` and `navigation.test.ts`.

- [ ] **Step 6: Run the unit tests**
  Run: `rite test-unit`
  Expected: PASS (nothing in `src/core` changed; this guards the build).

- [ ] **Step 7: Commit**
  `git commit -m "feat: quickdiff.singleDiffEditor keeps one diff tab open"`

### Task 3: Docs

**Files:**
- Modify: `README.md`
- Modify: `CHANGELOG.md`

- [ ] **Step 1: README**
  Add a row to the Settings table: `quickdiff.singleDiffEditor` | `false` | Keep only one QuickDiff diff open. Opening a change closes the other QuickDiff diff tabs, even pinned ones, in every editor group. Tabs with unsaved edits stay open. Use /writing-clearly.

- [ ] **Step 2: CHANGELOG**
  Under `## Unreleased`, add: `quickdiff.singleDiffEditor` setting (off by default): opening a change closes the other QuickDiff diff tabs, so one diff stays open even when VS Code preview tabs are disabled or the tab was pinned.

- [ ] **Step 3: Commit**
  `git commit -m "docs: document quickdiff.singleDiffEditor"`

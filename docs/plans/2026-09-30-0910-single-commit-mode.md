# Single Commit Mode Implementation Plan

**Status:** Completed 2026-09-30. See the Completion summary at the end.

> **For agentic workers:** Use executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A fourth diff mode that shows the changes introduced by one commit, reachable from the mode picker, the `vscode://` URL, and `qd -c`.

**Tech Stack:** TypeScript extension over the bundled `vscode.git` API (version 1), Vitest for `src/core` and `bin/qd`, Mocha inside a headless VS Code for integration tests, bash for `bin/qd`. Tasks run with `rite` (`rite.edn`).

---

## Design

### Why

Today a single commit can be viewed only through two-refs mode with the commit's parent typed by hand (`qd abc1234~1 abc1234`). That works because two-refs mode diffs `merge-base(from, to)` against `to`, and a parent is always an ancestor. The diffing is already right; what is missing is a name for it and direct entry points.

### The mode

`DiffMode` gets a fourth member:

```ts
| { kind: 'commit'; ref: string }
```

`ref` is whatever the user gave: a full hash from the picker, or anything `git rev-parse` accepts when typed (`HEAD`, `v1.2`, `abc1234`, `master~2`).

Listing, in `ChangesModel.listChanges`:

1. `const commit = await this.repo.getCommit(mode.ref)`. An unknown ref rejects here, which surfaces the same way as an unknown branch base today (error shown, previous list kept).
2. `const parent = commit.parents[0]`. If there is none, throw `Error(\`${mode.ref} is a root commit; nothing to compare with\`)`. `diffBetween` runs `git diff a...b`, and the empty tree has no merge base with anything, so a root commit cannot be listed without shelling out, which the v1 plan ruled out.
3. Return `{ resolved: { left: parent, right: commit.hash }, changes: await this.repo.diffBetween(parent, commit.hash) }`.

`resolved.right` is the resolved hash, not the ref, so open diff editors stay pinned to that commit even if the ref moves. The persisted mode keeps `ref` as given, so `{ kind: 'commit', ref: 'HEAD' }` re-resolves on refresh, the same way branch mode follows `HEAD`.

Merge commits diff against the first parent, matching `git show` and GitHub's commit view. Not configurable.

`hunksFor` and `diffText` need no change: they work from `resolved`, and `left` is an ancestor of `right`, so `diffBetween(left, right, path)` and `diffBlobs` for renames give exactly the commit's hunks.

### Label

`modeLabel` returns `commit <ref>`, with a 40-character hex ref shortened to its first 7 characters (picker choices are full hashes). Anything else appears as typed: `commit HEAD`, `commit v1.2`. This label is used by the view message and in error messages via `showGitError`.

### URL codec

`mode=commit&ref=<ref>`. `formatOpenQuery` sets `ref`; `parseMode` returns undefined when `ref` is missing, like the other modes.

### Picker

A fourth top-level entry in `pickMode`:

| Label | Detail |
|-------|--------|
| `Single commit…` | `Changes introduced by one commit` |

`pickModeParams` for `'commit'` calls `pickRef('Commit', await commitItems(model), active)` where `active` is the current ref when the model is already in commit mode. The items are the recent commits only, plus the existing "Type a ref…" entry; branches are omitted because a branch name is just its tip commit and "Type a ref…" covers it.

### CLI

`-c` / `--commit` is a boolean flag that changes how positionals are read:

| Command | Query |
|---------|-------|
| `qd -c` | `mode=commit&ref=HEAD` |
| `qd -c <ref>` | `mode=commit&ref=<ref>` |
| `qd -c a b` | usage error, exit 2 |

It composes with `-a` and `--print-url`. The usage text gains one line and the `mode=` case statement gains a branch on the flag.

### Docs

README: a row in the modes table, a sentence on first-parent semantics and the root-commit error next to the existing two-refs paragraph, and `qd -c` lines in the terminal examples. CHANGELOG: a new `## Unreleased` section. The version is bumped at release time, not here.

### Testing

- Unit (`test/unit/mode.test.ts`): label for a full hash and for a symbolic ref; codec round-trip; `commit` without `ref` rejected.
- Unit (`test/unit/qd.test.ts`): the three CLI cases above.
- Integration (`test/integration/listing.test.ts`): the existing fixture mostly fits. `master`'s tip commit ("master work") changes `a.txt` line 1 and has a 40-hex parent, so `{ kind: 'commit', ref: 'master' }` lists `[['a.txt', 'modified']]` with hunks `[1]`, `resolved.left` and `resolved.right` both 40-hex, and `resolved.right` not equal to `'master'`. `master~1` is the root commit, which gives the rejection test.
- Integration, merge commit: the fixture builder gains one leaf branch `merged`, created from `rename` by merging `feature` with `--no-ff`. The merge is clean (`rename` touches only `a.txt`; `feature` touches `src/b.ts`, `new.txt`, `deleted.txt`). Against its first parent (`rename`) the merge lists exactly the branch fixture's files and hunks; against its second parent it would show the rename, so the test proves first-parent semantics. `merged` is a leaf, so no other fixture list changes.

### Out of scope

An "open commit at cursor" command, an SCM graph context-menu entry, and the two-refs merge-base backlog item (`docs/backlog/refs-mode-merge-base.md`), which this does not affect.

## File Structure

Modify:

- `src/core/mode.ts`: `DiffMode` member, `modeLabel`, `formatOpenQuery`, `parseMode`.
- `src/model.ts`: `case 'commit'` in `listChanges`.
- `src/modePicker.ts`: picker entry and `pickModeParams` case.
- `bin/qd`: `-c` flag, usage text, mode query.
- `README.md`: modes table, semantics paragraph, CLI examples.
- `CHANGELOG.md`: `## Unreleased` section.
- `test/unit/mode.test.ts`, `test/unit/qd.test.ts`: new cases.
- `test/fixture/makeRepo.mjs`: `commit` and `mergeCommit` entries in `FIXTURE`; the builder gains the `merged` branch.
- `test/integration/helpers.ts`: `commit` in `FixtureSpec`.
- `test/integration/listing.test.ts`: two new cases.

No new files.

## Tasks

### Task 1: Mode type, label, and URL codec

**Files:**
- Modify: `src/core/mode.ts`
- Test: `test/unit/mode.test.ts`

- [x] **Step 1: Write the failing tests**
  In `test/unit/mode.test.ts`:
  - In `modeLabel`: `{ kind: 'commit', ref: 'a'.repeat(40) }` → `'commit aaaaaaa'`; `{ kind: 'commit', ref: 'HEAD' }` → `'commit HEAD'`.
  - In the round-trip `requests` array: `{ cwd: '/repo', mode: { kind: 'commit', ref: 'v1.0#x' }, view: 'file' }`.
  - In the `rejects` table: `['commit without ref', 'cwd=%2Frepo&mode=commit']`.

- [x] **Step 2: Run the unit tests to see them fail**
  Run: `npx vitest run test/unit/mode.test.ts`
  Expected: type errors or failing assertions for the three new cases.

- [x] **Step 3: Implement**
  In `src/core/mode.ts`: add `| { kind: 'commit'; ref: string }` to `DiffMode`; add the `case 'commit'` to `modeLabel` (shorten only when the ref matches `/^[0-9a-f]{40}$/`); set `ref` in `formatOpenQuery`; parse `mode=commit` in `parseMode`, returning undefined without `ref`.

- [x] **Step 4: Run the unit tests**
  Run: `npx vitest run test/unit/mode.test.ts`
  Expected: PASS. `npx tsc -p . --noEmit` now reports non-exhaustive switches in `src/model.ts` and `src/modePicker.ts`; the next two tasks fix them.

- [x] **Step 5: Commit**
  `git commit -m "feat(core): commit mode type, label, and query codec"`

### Task 2: Listing a commit in the model

**Files:**
- Modify: `src/model.ts`
- Modify: `test/fixture/makeRepo.mjs`, `test/integration/helpers.ts`
- Test: `test/integration/listing.test.ts`

- [x] **Step 1: Add the fixture expectations and the merge commit**
  In `test/fixture/makeRepo.mjs`, add to `FIXTURE`:
  ```js
  // Tip of master ("master work") against its parent; master~1 is the root commit.
  commit: {
    ref: 'master',
    files: [['a.txt', 'modified']],
    hunks: { 'a.txt': [1] },
  },
  // Merge of feature into rename; against its first parent (rename) it shows feature's changes.
  mergeCommit: {
    ref: 'merged',
    files: [
      ['deleted.txt', 'deleted'],
      ['new.txt', 'added'],
      ['src/b.ts', 'modified'],
    ],
    hunks: { 'deleted.txt': [1], 'new.txt': [1], 'src/b.ts': [3, 15] },
  },
  ```
  In `createFixtureRepo`, after the rename commit and before "Working tree on feature", add a leaf branch: `git checkout -q -b merged` (from `rename`), then `git merge -q --no-ff -m 'merge feature' feature`. The merge is clean. Keep the final `git checkout -q feature` so the working tree fixture is unchanged.
  In `test/integration/helpers.ts`, add `commit: ModeFixture & { ref: string }` and `mergeCommit: ModeFixture & { ref: string }` to `FixtureSpec`.

- [x] **Step 2: Write the failing integration tests**
  In `test/integration/listing.test.ts`:
  - `lists the changes of a single commit against its parent`: `setMode({ kind: 'commit', ref: fixture.commit.ref })`; `listing(model)` equals `fixture.commit.files`; `resolved.left` and `resolved.right` both match `/^[0-9a-f]{40}$/`; `resolved.right !== 'master'`; hunks of `model.files[0]` equal `fixture.commit.hunks['a.txt']`.
  - `diffs a merge commit against its first parent`: `setMode({ kind: 'commit', ref: fixture.mergeCommit.ref })`; `listing(model)` equals `fixture.mergeCommit.files`; hunks of every file equal `fixture.mergeCommit.hunks[file.path]`.
  - `rejects a root commit and keeps the previous list`: capture `listing` and `mode`, `assert.rejects(model.setMode({ kind: 'commit', ref: 'master~1' }), /root commit/)`, then assert both unchanged.
  Run `rite test-it` once before implementing to confirm the existing suites still pass with the new `merged` branch in the fixture.

- [x] **Step 3: Implement**
  In `src/model.ts` `listChanges`, add `case 'commit'` following the design: `getCommit`, first parent or throw, `diffBetween(parent, commit.hash)`, `resolved: { left: parent, right: commit.hash }`.

- [x] **Step 4: Compile and run the integration tests**
  Run: `rite test-it`
  Expected: `tsc` still fails on `src/modePicker.ts` (non-exhaustive switch) until Task 3. If so, do Task 3 Steps 1 and 2 first, then return here. All listing tests PASS, including the three new ones.

- [x] **Step 5: Commit**
  `git commit -m "feat: list a single commit against its first parent"`

### Task 3: Picker entry

**Files:**
- Modify: `src/modePicker.ts`

No automated test: the picker is interactive and the existing picker has none either.

- [x] **Step 1: Add the picker entry**
  In `pickMode`, add `{ label: mark('commit', 'Single commit…'), mode: 'commit' as const, detail: 'Changes introduced by one commit' }` after the two-refs entry.

- [x] **Step 2: Add the params case**
  In `pickModeParams`, `case 'commit'`: `active` is `model.mode.ref` when `model.mode.kind === 'commit'`; `const ref = await pickRef('Commit', await commitItems(model), active)`; return `{ kind: 'commit', ref }` or undefined.

- [x] **Step 3: Type-check and run everything**
  Run: `rite test`
  Expected: `tsc` clean, unit and integration suites PASS.

- [ ] **Step 4: Manual check**
  `rite watch`, F5 "Run Extension", Pick Mode → Single commit… → pick a recent commit. The view message reads `commit <7 chars>`; the list shows that commit's files; opening one shows only that commit's hunks. Pick Mode again shows the check mark on "Single commit…" with the same commit preselected. Type a ref… with `HEAD` shows `commit HEAD`.

> Deviation: Step 4 (manual F5 check) not run; this session is headless. The picker wiring is covered by the type-checked switch and the model integration tests; the URI end-to-end pass in the final verification exercises the same setMode path.

- [x] **Step 5: Commit**
  `git commit -m "feat: single commit entry in the mode picker"`

### Task 4: `qd -c`

**Files:**
- Modify: `bin/qd`
- Test: `test/unit/qd.test.ts`

- [x] **Step 1: Write the failing tests**
  In `test/unit/qd.test.ts`, using `formatOpenUrl` for the expected string as the existing cases do:
  - `prints a commit url for HEAD with -c and no ref`: `qd(repo, ['-c', '--print-url'])` → `mode: { kind: 'commit', ref: 'HEAD' }`, `view: 'file'`; stdout contains `mode=commit&ref=HEAD`.
  - `prints a commit url for -c with a ref and -a`: `qd(repo, ['--commit', 'abc1234', '-a', '--print-url'])` → `{ kind: 'commit', ref: 'abc1234' }`, `view: 'all'`.
  - `rejects two refs with -c`: `qd(repo, ['-c', 'a', 'b', '--print-url'])` → status 2, stderr matches `/usage/i`.

- [x] **Step 2: Run to see them fail**
  Run: `npx vitest run test/unit/qd.test.ts`
  Expected: the first two fail on `unknown option: -c` (exit 2); the third passes by accident. Fine.

- [x] **Step 3: Implement**
  In `bin/qd`: a `commit=0` variable set by `-c | --commit`; usage gains `qd -c [<ref>]     changes of a single commit (default HEAD)` and the option line; after parsing, when `commit` is set, more than one ref is a usage error, and the query is `&mode=commit&$(param ref "${refs[0]:-HEAD}")`. Keep the existing `case ${#refs[@]}` for the non-commit path.

- [x] **Step 4: Run the unit tests**
  Run: `npx vitest run`
  Expected: PASS.

- [x] **Step 5: Commit**
  `git commit -m "feat: qd -c opens a single commit"`

### Task 5: Docs

**Files:**
- Modify: `README.md`, `CHANGELOG.md`

- [x] **Step 1: README**
  - Modes table: `| Single commit | One commit with its first parent | Reviewing one commit |`. Update "There are three modes" to four.
  - After the two-refs semantics paragraph: "Single commit mode compares a commit with its first parent, the same as `git show`. A root commit has no parent and cannot be shown."
  - Terminal examples: `qd -c` (`# the last commit`) and `qd -c abc1234` (`# one commit`), and update the `usage:` block if the README reproduces it.
  - Use /writing-clearly.

- [x] **Step 2: CHANGELOG**
  Add at the top:
  ```
  ## Unreleased

  - Single commit mode: a commit against its first parent, from the picker, the `vscode://` URL (`mode=commit&ref=`), or `qd -c [<ref>]`.
  ```

- [x] **Step 3: Commit**
  `git commit -m "docs: single commit mode"`

### Task 6: Final verification

- [x] **Step 1: Full test run**
  Run: `rite test`
  Expected: unit and integration suites PASS.

- [x] **Step 2: Package**
  Run: `rite package`
  Expected: a `.vsix` is written without warnings about `package.json` (no manifest changes were needed: no new commands or settings).

> Deviation: added `test/integration/uri.test.ts` case "applies a commit request built by qd -c" as the end-to-end pass: it runs the real `bin/qd -c master --print-url`, feeds the URL to the URI handler, and checks the mode, the view message, and the opened diff tab. Not in the plan; added so the user-facing path stays checked.

## Completion summary

Implemented on branch `single-commit-mode` (commits 1cf1da6..HEAD), all tasks done and checked off.

- `DiffMode` has a `commit` member; `modeLabel` shows `commit <7-char hash>` or `commit <ref>`; the URL codec handles `mode=commit&ref=`.
- `ChangesModel.listChanges` resolves the commit with `getCommit`, diffs it against its first parent, pins the right side to the resolved hash, and rejects root commits with a clear error while keeping the previous list.
- Mode picker has a "Single commit…" entry listing recent commits plus "Type a ref…".
- `qd -c [<ref>]` (default `HEAD`) emits the commit URL; two refs with `-c` is a usage error.
- README modes table and terminal examples, CHANGELOG `## Unreleased`.
- Tests: 62 unit, 36 integration, all passing. `rite package` builds the `.vsix` cleanly.

Codex reviewed every task commit. The only finding was on Task 1 (the model did not yet handle the new variant), which was the planned intermediate state resolved by Task 2.

Deviations:

- Task 3 Step 4 (manual F5 picker check) was not run; the session is headless. Covered by the type-checked switch, the model integration tests, and the URI end-to-end test.
- Task 6: added an end-to-end integration test driving `bin/qd -c` through the URI handler (see the note under Task 6).

What the plan could have specified better: the end-to-end check should have been a listed test from the start, since the picker step cannot run headless and the URI path was the only user-facing route that could be exercised automatically.

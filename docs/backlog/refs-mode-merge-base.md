# Two-refs mode shows merge-base..to, so reversed or diverged ranges are not a from..to diff

**Status: open**

## Problem

Two-refs mode (`qd <from> <to>`, or Pick Mode → Two refs) is meant to compare `from` with `to`. It actually compares `merge-base(from, to)` with `to`. The cause is the git extension API: `Repository.diffBetween(a, b)` runs `git diff a...b` (three dots), and API version 1 has no endpoint diff. The listing is in `ChangesModel.listChanges`, `src/model.ts:137-145`. It resolves the merge base and uses it as the left side, so the file list, the hunks (`diffText`), and the diff editor sides all agree.

What a user sees:

- `qd v1.0 v1.1`, or any `from` that is an ancestor of `to`: correct. The merge base is `from`, so this is exactly `git diff from to`.
- `qd master master~1` (reversed): **No changes**. The merge base is `master~1`, so it compares `master~1` with itself.
- `qd feature-a feature-b` (diverged): shows what `feature-b` changed since it split from `feature-a` (GitHub compare semantics), not `git diff feature-a feature-b`. Changes that exist only on `feature-a` are missing.

The common uses (an older tag or commit against a newer one, a branch against its base) are unaffected. Branch mode deliberately uses merge-base semantics and is unaffected too.

## Why it is left alone

The only way to get an endpoint diff is to run git ourselves, e.g. `git diff --name-status -z -M from to` through the git extension's binary (`api.git.path`). The v1 plan chose "never shell out" so that refs, renames, and encodings come from the git extension. Doing it for refs mode means parsing the `--name-status -z` output ourselves, including rename pairs, building `Change`-like objects with `Uri`s, and getting hunks with `git diff from to -- <old> <new>` instead of `diffBetween`/`diffBlobs`.

Before that, a cheaper option is worth checking: newer VS Code versions of the git extension may expose an endpoint diff (the 1.139 bundle has `diffBetweenWithStats` and `diffTrees` internally). If one reaches the public API, raising `engines.vscode` and using it would fix this without shelling out.

Worth doing when someone actually uses reversed or diverged ranges. Until then, the README documents the merge-base semantics.

## Origin

The codex review of Task 5 in `docs/plans/2026-09-25-1914-quickdiff-v1.md` (2026-09-25) flagged it as P1: refs mode listed `from...to` while the diff sides showed `from`. The executing session made the sides consistent with the merge base (commit "fix: use the merge base as the refs-mode left side…"). It recorded this deviation because the user declined to choose between merge base, shelling out, and leaving it as planned.

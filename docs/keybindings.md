# Keybindings

QuickDiff ships without keybindings, so it never takes over shortcuts you or other extensions already use. Bind the commands you want in your `keybindings.json`: run **Preferences: Open Keyboard Shortcuts (JSON)** from the Command Palette and paste one of the blocks below.

## Commands

| Command | ID |
|---------|----|
| Next File | `quickdiff.nextFile` |
| Previous File | `quickdiff.prevFile` |
| Next Change | `quickdiff.nextHunk` |
| Previous Change | `quickdiff.prevHunk` |
| Focus the Changes list | `quickdiff.files.focus` |
| Open All Changes | `quickdiff.openAll` |
| Pick Mode | `quickdiff.pickMode` |
| Refresh | `quickdiff.refresh` |

Next and previous change continue into the next or previous file at the ends, and file navigation wraps around. In the multi-diff editor, next and previous change or file move between changes across all files.

## Example: Linux and Windows

```json
[
  { "key": "ctrl+alt+j", "command": "quickdiff.nextFile" },
  { "key": "ctrl+alt+k", "command": "quickdiff.prevFile" },
  { "key": "ctrl+alt+n", "command": "quickdiff.nextHunk" },
  { "key": "ctrl+alt+p", "command": "quickdiff.prevHunk" },
  { "key": "ctrl+alt+d", "command": "quickdiff.files.focus" },
  { "key": "ctrl+alt+a", "command": "quickdiff.openAll" },
  { "key": "ctrl+alt+m", "command": "quickdiff.pickMode" }
]
```

On Windows, `Ctrl+Alt` is the same as `AltGr` on many keyboard layouts, where it types characters such as `ą` (Polish `AltGr+A`) or `µ` (German `AltGr+M`). If you type those, pick other keys.

## Example: macOS

```json
[
  { "key": "cmd+alt+j", "command": "quickdiff.nextFile" },
  { "key": "cmd+alt+k", "command": "quickdiff.prevFile" },
  { "key": "cmd+alt+n", "command": "quickdiff.nextHunk" },
  { "key": "cmd+alt+p", "command": "quickdiff.prevHunk" },
  { "key": "cmd+alt+d", "command": "quickdiff.files.focus" },
  { "key": "cmd+alt+a", "command": "quickdiff.openAll" },
  { "key": "cmd+alt+m", "command": "quickdiff.pickMode" }
]
```

## Limiting where a binding applies

Bindings without a `when` clause work everywhere. To use a key for QuickDiff only while a diff is open and keep its usual meaning elsewhere, add a condition:

```json
{ "key": "ctrl+alt+n", "command": "quickdiff.nextHunk", "when": "isInDiffEditor" }
```

import { describe, expect, it } from 'vitest';
import { nextHunkLine, parseHunkLines, prevHunkLine } from '../../src/core/hunks';

const header = [
  'diff --git a/src/b.ts b/src/b.ts',
  'index 1111111..2222222 100644',
  '--- a/src/b.ts',
  '+++ b/src/b.ts',
];

const diff = (...body: string[]) => [...header, ...body].join('\n') + '\n';

describe('parseHunkLines', () => {
  it('finds a single change after context', () => {
    expect(parseHunkLines(diff('@@ -1,6 +1,6 @@', ' b1', ' b2', '-b3', '+b3-changed', ' b4', ' b5', ' b6'))).toEqual([3]);
  });

  it('finds two hunks', () => {
    expect(
      parseHunkLines(
        diff(
          '@@ -1,6 +1,6 @@', ' b1', ' b2', '-b3', '+b3-changed', ' b4', ' b5', ' b6',
          '@@ -12,7 +12,7 @@', ' b12', ' b13', ' b14', '-b15', '+b15-changed', ' b16', ' b17', ' b18',
        ),
      ),
    ).toEqual([3, 15]);
  });

  it('places a pure deletion on the modified line after it', () => {
    expect(parseHunkLines(diff('@@ -3,5 +3,4 @@', ' c3', ' c4', '-c5', ' c6', ' c7'))).toEqual([5]);
  });

  it('handles an insertion at the top of an empty file', () => {
    expect(parseHunkLines(diff('@@ -0,0 +1,2 @@', '+n1', '+n2'))).toEqual([1]);
  });

  it('clamps a deletion of a whole file to line 1', () => {
    expect(parseHunkLines(diff('@@ -1,2 +0,0 @@', '-d1', '-d2'))).toEqual([1]);
  });

  it('returns nothing for an empty diff', () => {
    expect(parseHunkLines('')).toEqual([]);
  });

  it('does not mistake header lines for changes', () => {
    expect(parseHunkLines(header.join('\n'))).toEqual([]);
  });

  it('ignores the no-newline marker and body lines that look like headers', () => {
    expect(
      parseHunkLines(diff('@@ -1,2 +1,2 @@', ' x', '--- not a header', '+++ not a header', '\\ No newline at end of file')),
    ).toEqual([2]);
  });
});

describe('hunk stepping', () => {
  const hunks = [3, 15];

  it('steps forward strictly', () => {
    expect(nextHunkLine(hunks, 1)).toBe(3);
    expect(nextHunkLine(hunks, 3)).toBe(15);
    expect(nextHunkLine(hunks, 15)).toBeUndefined();
    expect(nextHunkLine([], 1)).toBeUndefined();
  });

  it('steps backward strictly', () => {
    expect(prevHunkLine(hunks, 20)).toBe(15);
    expect(prevHunkLine(hunks, 15)).toBe(3);
    expect(prevHunkLine(hunks, 3)).toBeUndefined();
    expect(prevHunkLine([], 5)).toBeUndefined();
  });
});

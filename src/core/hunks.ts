const HUNK_HEADER = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/;

/**
 * Returns the modified-side line (1-based) of the first changed line in each hunk
 * of a single-file unified diff.
 */
export function parseHunkLines(diff: string): number[] {
  const result: number[] = [];
  let inHunk = false;
  let recorded = false;
  let modifiedLine = 0;
  for (const line of diff.split('\n')) {
    const header = HUNK_HEADER.exec(line);
    if (header) {
      inHunk = true;
      recorded = false;
      modifiedLine = Number(header[1]);
      continue;
    }
    if (!inHunk) {
      continue;
    }
    if (line.startsWith('+')) {
      if (!recorded) {
        result.push(Math.max(modifiedLine, 1));
        recorded = true;
      }
      modifiedLine++;
    } else if (line.startsWith('-')) {
      if (!recorded) {
        result.push(Math.max(modifiedLine, 1));
        recorded = true;
      }
    } else if (line.startsWith(' ')) {
      modifiedLine++;
    }
  }
  return result;
}

export function nextHunkLine(hunks: number[], currentLine: number): number | undefined {
  return hunks.find((line) => line > currentLine);
}

export function prevHunkLine(hunks: number[], currentLine: number): number | undefined {
  return [...hunks].reverse().find((line) => line < currentLine);
}

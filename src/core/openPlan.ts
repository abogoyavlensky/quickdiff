import * as path from 'node:path';
import type { OpenRequest } from './mode';

export type OpenPlan =
  | { action: 'apply'; request: OpenRequest }
  | { action: 'openFolder'; folder: string; request: OpenRequest }
  | { action: 'reject'; reason: string };

/** True when `child` is `root` or lies beneath it (path-aware, not a string prefix). */
export function isInside(child: string, root: string): boolean {
  const relative = path.relative(root, child);
  return relative === '' || (relative !== '..' && !relative.startsWith('..' + path.sep) && !path.isAbsolute(relative));
}

/**
 * Decides how to handle an open request: apply it in this window when `cwd` is inside one of
 * `workspaceFolders` (the bound repository root when there is one), otherwise open `cwd`.
 */
export function planOpen(request: OpenRequest, workspaceFolders: string[]): OpenPlan {
  if (!path.isAbsolute(request.cwd)) {
    return { action: 'reject', reason: `cwd must be an absolute path: ${request.cwd}` };
  }
  if (workspaceFolders.some((folder) => isInside(request.cwd, folder))) {
    return { action: 'apply', request };
  }
  return { action: 'openFolder', folder: path.resolve(request.cwd), request };
}

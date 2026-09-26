export type DiffMode =
  | { kind: 'worktree' }
  | { kind: 'branch'; base: string }
  | { kind: 'refs'; from: string; to: string };

export interface OpenRequest {
  cwd: string;
  mode: DiffMode;
  view: 'file' | 'all';
}

export function modeLabel(mode: DiffMode): string {
  switch (mode.kind) {
    case 'worktree':
      return 'working tree';
    case 'branch':
      return `HEAD → ${mode.base}`;
    case 'refs':
      return `${mode.from}..${mode.to}`;
  }
}

export function formatOpenQuery(request: OpenRequest): string {
  const params = new URLSearchParams({ cwd: request.cwd, mode: request.mode.kind });
  if (request.mode.kind === 'branch') {
    params.set('base', request.mode.base);
  } else if (request.mode.kind === 'refs') {
    params.set('from', request.mode.from);
    params.set('to', request.mode.to);
  }
  params.set('view', request.view);
  return params.toString();
}

export const OPEN_URL_AUTHORITY = 'abogoyavlensky.quickdiff';

/**
 * Builds the `vscode://` URL for a request. VS Code percent-decodes the query once before the
 * URI handler sees it, so `%` is escaped once more: after that decoding, `uri.query` is exactly
 * `formatOpenQuery(request)`, and values with `+`, `&`, `=`, or `%` survive intact.
 */
export function formatOpenUrl(request: OpenRequest, scheme = 'vscode'): string {
  return `${scheme}://${OPEN_URL_AUTHORITY}/open?${formatOpenQuery(request).replace(/%/g, '%25')}`;
}

/** Parses `uri.query` as delivered to the URI handler (already percent-decoded once by VS Code). */
export function parseOpenQuery(query: string): OpenRequest | undefined {
  const params = new URLSearchParams(query);
  const cwd = params.get('cwd');
  const view = params.get('view') ?? 'file';
  if (!cwd || (view !== 'file' && view !== 'all')) {
    return undefined;
  }
  const mode = parseMode(params);
  return mode && { cwd, mode, view };
}

function parseMode(params: URLSearchParams): DiffMode | undefined {
  switch (params.get('mode')) {
    case 'worktree':
      return { kind: 'worktree' };
    case 'branch': {
      const base = params.get('base');
      return base ? { kind: 'branch', base } : undefined;
    }
    case 'refs': {
      const from = params.get('from');
      const to = params.get('to');
      return from && to ? { kind: 'refs', from, to } : undefined;
    }
    default:
      return undefined;
  }
}

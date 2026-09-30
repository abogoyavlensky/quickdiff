import { defineConfig } from '@vscode/test-cli';
import { rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { createFixtureRepo } from './test/fixture/makeRepo.mjs';

const fixtureRepo = resolve('.vscode-test/fixture-repo');
createFixtureRepo(fixtureRepo);
// Start every run with fresh workspace state so a persisted mode cannot leak between runs.
rmSync(resolve('.vscode-test/user-data'), { recursive: true, force: true });

export default defineConfig({
  files: 'out/test/integration/**/*.test.js',
  workspaceFolder: fixtureRepo,
  version: 'stable',
  // No GPU under xvfb: the renderer can hang at startup on CI runners.
  launchArgs: ['--disable-workspace-trust', '--disable-gpu'],
  mocha: { ui: 'bdd', timeout: 30000, color: true },
});

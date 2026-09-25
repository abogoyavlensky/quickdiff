import { defineConfig } from '@vscode/test-cli';
import { resolve } from 'node:path';
import { createFixtureRepo } from './test/fixture/makeRepo.mjs';

const fixtureRepo = resolve('.vscode-test/fixture-repo');
createFixtureRepo(fixtureRepo);

export default defineConfig({
  files: 'out/test/integration/**/*.test.js',
  workspaceFolder: fixtureRepo,
  version: 'stable',
  launchArgs: ['--disable-workspace-trust'],
  mocha: { ui: 'bdd', timeout: 30000, color: true },
});

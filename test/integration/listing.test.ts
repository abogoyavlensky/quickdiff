import * as assert from 'node:assert';
import { getModel, listing, loadFixture, resetToWorktree, type FixtureSpec } from './helpers';

describe('changes model', () => {
  let fixture: FixtureSpec;

  before(async () => {
    fixture = await loadFixture();
  });

  after(resetToWorktree);

  it('starts in worktree mode with staged, unstaged, and untracked changes', async () => {
    const model = await getModel();
    assert.deepStrictEqual(model.mode, { kind: 'worktree' });
    assert.deepStrictEqual(listing(model), fixture.worktree.files);
  });

  it('computes worktree hunks', async () => {
    const model = await getModel();
    for (const file of model.files) {
      assert.deepStrictEqual(await model.hunksFor(file), fixture.worktree.hunks[file.path], file.path);
    }
  });

  it('lists committed branch changes against the merge base', async () => {
    const model = await getModel();
    await model.setMode({ kind: 'branch', base: fixture.branch.base });
    assert.deepStrictEqual(listing(model), fixture.branch.files);
    assert.strictEqual(model.resolved.right, 'HEAD');
    assert.match(model.resolved.left, /^[0-9a-f]{40}$/);
    for (const file of model.files) {
      assert.deepStrictEqual(await model.hunksFor(file), fixture.branch.hunks[file.path], file.path);
    }
  });

  it('lists changes between two refs', async () => {
    const model = await getModel();
    await model.setMode({ kind: 'refs', from: fixture.refs.from, to: fixture.refs.to });
    assert.deepStrictEqual(listing(model), fixture.refs.files);
    assert.deepStrictEqual(await model.hunksFor(model.files[0]), fixture.refs.hunks['a.txt']);
  });

  it('rejects an unknown base and keeps the previous list', async () => {
    const model = await getModel();
    const before = listing(model);
    const modeBefore = model.mode;
    await assert.rejects(model.setMode({ kind: 'branch', base: 'no-such-branch' }));
    assert.deepStrictEqual(listing(model), before);
    assert.deepStrictEqual(model.mode, modeBefore);
  });
});

const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const { mkdtempSync, rmSync, writeFileSync } = require('node:fs');
const { tmpdir } = require('node:os');
const path = require('node:path');
const { after, test } = require('node:test');

const directory = mkdtempSync(path.join(tmpdir(), 'inkstone-native-runner-'));
const playwright = path.join(directory, 'playwright.cjs');
const runner = path.join(__dirname, 'verify-upgrade.cjs');
after(() => rmSync(directory, { recursive: true, force: true }));

// Replace only the remote browser boundary. These fixtures test the runner's
// selection, reporting and exit status; they do not validate native Obsidian UI.
writeFileSync(playwright, `
let evaluations = 0;
const failure = () => { throw new Error('Isolated native interaction failure'); };
const locator = {
  waitFor: async () => {},
  first() { return this; },
  textContent: async () => '可见高亮'
};
const page = {
  url: () => 'app://obsidian.md/index.html',
  setDefaultTimeout() {},
  waitForFunction: async () => {},
  setViewportSize: async () => {},
  title: async () => 'Isolated runner fixture',
  keyboard: { press: async () => { if (process.env.INKSTONE_RUNNER_FAIL) failure(); } },
  locator: () => locator,
  evaluate: async (_work, argument) => {
    evaluations++;
    if (evaluations === 1) return 'Inkstone Upgrade Preview';
    if (evaluations === 2) return true;
    // The third call initializes the plugin; the final true restores nativeMenus.
    if (evaluations === 3 || argument === true) return;
    if (process.env.INKSTONE_RUNNER_FAIL) failure();
  }
};
exports.chromium = {
  connectOverCDP: async endpoint => {
    if (endpoint !== 'isolated-runner-test://no-network') throw Error('Unexpected endpoint');
    return { contexts: () => [{ pages: () => [page] }], close: async () => {} };
  }
};
`);

function run(selection, fail = false) {
  const result = spawnSync(process.execPath, [runner, ...selection], {
    encoding: 'utf8', timeout: 10000,
    env: {
      ...process.env,
      INKSTONE_PLAYWRIGHT: playwright,
      INKSTONE_CDP: 'isolated-runner-test://no-network',
      INKSTONE_RUNNER_FAIL: fail ? '1' : ''
    }
  });
  assert.ifError(result.error);
  assert.equal(result.signal, null, result.stderr);
  return result;
}

function summary(result) {
  const start = result.stdout.indexOf('{\n');
  assert(start >= 0, 'Runner should print its actual results summary: ' + result.stderr);
  return JSON.parse(result.stdout.slice(start));
}

test('unknown native case exits nonzero and identifies the rejected name', () => {
  const result = run(['does-not-exist']);
  assert.notEqual(result.status, 0, 'A zero-case run must not report success');
  assert.match(result.stderr, /Unknown case.*does-not-exist/);
  assert.doesNotMatch(result.stdout, /^PASS /m);
});

test('known native case still reports exactly its successful result', () => {
  const result = run(['live-preview']);
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(summary(result).results, [{ name: 'live-preview', passed: true }]);
});

test('a selected native case failure propagates through the runner exit status', () => {
  const result = run(['live-preview'], true);
  assert.equal(result.status, 1, result.stderr);
  assert.deepEqual(summary(result).results, [{
    name: 'live-preview', passed: false, error: 'Isolated native interaction failure'
  }]);
});

for (const selection of [[], ['all']]) {
  test(`${selection.length ? 'explicit all' : 'default'} native run aggregates case failures`, () => {
    const result = run(selection, true);
    assert.equal(result.status, 1, result.stderr);
    const records = summary(result).results;
    assert(records.length > 1, 'All cases should be dispatched instead of an empty run');
    for (const name of ['reading-repeat', 'live-preview']) {
      assert(records.some(record => record.name === name && record.passed === false &&
        record.error === 'Isolated native interaction failure'));
    }
  });
}

test('the reading workflow runner also rejects a zero-case selection', () => {
  const result = spawnSync(process.execPath, [path.join(__dirname, 'verify-reading-workflow.cjs'), 'does-not-exist'], {
    encoding: 'utf8', timeout: 10000,
    env: {...process.env, INKSTONE_PLAYWRIGHT:playwright, INKSTONE_CDP:'isolated-runner-test://no-network'}
  });
  assert.ifError(result.error);
  assert.equal(result.status,1);
  assert.match(result.stderr,/Unknown case: does-not-exist/);
  assert.doesNotMatch(result.stdout,/^PASS /m);
});

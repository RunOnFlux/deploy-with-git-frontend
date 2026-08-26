import test from 'node:test';
import assert from 'node:assert/strict';

import {
  checkCompatibility,
  fetchBranches,
  listDirectories,
  testPrivateAuth,
} from '../src/services/repoIntelligenceService.js';

const parsedRepo = {
  provider: 'github.com',
  owner: 'RunOnFlux',
  repo: 'deploy-with-git-samples',
};

const cases = [
  { projectPath: 'dart', markerFile: 'pubspec.yaml', framework: 'Dart' },
  { projectPath: 'elixir', markerFile: 'mix.exs', framework: 'Elixir' },
  { projectPath: 'erlang', markerFile: 'rebar.config', framework: 'Erlang' },
  { projectPath: 'static', markerFile: 'index.html', framework: 'Static HTML' },
];

for (const expected of cases) {
  test(`detects the ${expected.framework} sample`, async (t) => {
    t.mock.method(globalThis, 'fetch', async (url, options) => {
      assert.equal(options.method, 'HEAD');
      return { ok: String(url).endsWith(`/${expected.projectPath}/${expected.markerFile}`) };
    });

    const result = await checkCompatibility(
      parsedRepo,
      'master',
      expected.projectPath,
    );

    assert.deepEqual(result, {
      status: 'compatible',
      message: `Found ${expected.markerFile}`,
      framework: expected.framework,
      markerFile: expected.markerFile,
    });
  });
}

test('detects a GitLab static project from any root-level HTML file', async (t) => {
  const token = 'private-gitlab-token';
  const requests = [];
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    requests.push({ url: String(url), options });
    if (String(url).includes('/repository/tree?')) {
      return {
        ok: true,
        json: async () => [
          { name: 'assets', type: 'tree' },
          { name: 'landing.html', type: 'blob' },
        ],
      };
    }
    return { ok: false };
  });

  const result = await checkCompatibility(
    { provider: 'gitlab.com', owner: 'group/subgroup', repo: 'single-page' },
    'main',
    '',
    { 'PRIVATE-TOKEN': token },
  );

  assert.deepEqual(result, {
    status: 'compatible',
    message: 'Found landing.html',
    framework: 'Static HTML',
    markerFile: 'landing.html',
  });
  assert.ok(requests.every(({ options }) => options.headers['PRIVATE-TOKEN'] === token));
});

test('GitLab authentication verifies repository read access', async (t) => {
  let request = 0;
  t.mock.method(globalThis, 'fetch', async () => {
    request++;
    return { ok: request === 1, status: request === 1 ? 200 : 403 };
  });

  const result = await testPrivateAuth(
    { provider: 'gitlab.com', owner: 'group', repo: 'private-project' },
    '',
    'metadata-only-token',
  );

  assert.deepEqual(result, {
    success: false,
    error: 'Token needs read_repository, read_api, or api scope',
  });
});

test('GitLab branch listing paginates beyond the first 100 branches', async (t) => {
  t.mock.method(globalThis, 'fetch', async (url) => {
    const value = String(url);
    if (!value.includes('/repository/branches')) return { ok: true, json: async () => ({ default_branch: 'main' }) };
    const page = new URL(value).searchParams.get('page');
    return {
      ok: true,
      json: async () => page === '1'
        ? Array.from({ length: 100 }, (_, index) => ({ name: index === 0 ? 'main' : `branch-${index}` }))
        : [{ name: 'branch-100' }],
    };
  });
  const branches = await fetchBranches({ provider: 'gitlab.com', owner: 'group', repo: 'project' });
  assert.equal(branches.length, 101);
  assert.equal(branches[0].name, 'main');
  assert.ok(branches.some((branch) => branch.name === 'branch-100'));
});

test('Bitbucket directory listing follows allowlisted next-page URLs', async (t) => {
  let calls = 0;
  t.mock.method(globalThis, 'fetch', async () => {
    calls++;
    return {
      ok: true,
      json: async () => calls === 1
        ? { values: [{ type: 'commit_directory', path: 'frontend' }], next: 'https://api.bitbucket.org/2.0/repositories/org/repo/src/main/?page=2' }
        : { values: [{ type: 'commit_directory', path: 'backend' }] },
    };
  });
  const directories = await listDirectories({ provider: 'bitbucket.org', owner: 'org', repo: 'repo' }, 'main');
  assert.deepEqual(directories, ['frontend', 'backend']);
  assert.equal(calls, 2);
});

test('GitLab static HTML detection reads the second tree page', async (t) => {
  const treePages = [];
  t.mock.method(globalThis, 'fetch', async (url, options = {}) => {
    const href = String(url);
    if (options.method === 'HEAD') return { ok: false };
    if (href.includes('/repository/tree?')) {
      const page = new URL(href).searchParams.get('page');
      treePages.push(page);
      return {
        ok: true,
        json: async () => page === '1'
          ? Array.from({ length: 100 }, (_, index) => ({ name: `file-${index}.txt`, type: 'blob' }))
          : [{ name: 'page-two.html', type: 'blob' }],
      };
    }
    throw new Error(`Unexpected request: ${href}`);
  });

  const result = await checkCompatibility(
    { provider: 'gitlab.com', owner: 'group', repo: 'large-static' },
    'main',
    '',
  );

  assert.equal(result.framework, 'Static HTML');
  assert.equal(result.markerFile, 'page-two.html');
  assert.deepEqual(treePages, ['1', '2']);
});

test('Bitbucket static HTML detection follows a validated second source page', async (t) => {
  const sourceRequests = [];
  t.mock.method(globalThis, 'fetch', async (url, options = {}) => {
    const href = String(url);
    if (options.method === 'HEAD') return { ok: false };
    sourceRequests.push(href);
    const page = new URL(href).searchParams.get('page');
    return {
      ok: true,
      json: async () => page === '2'
        ? { values: [{ type: 'commit_file', path: 'page-two.html' }] }
        : {
            values: Array.from({ length: 100 }, (_, index) => ({ type: 'commit_file', path: `file-${index}.txt` })),
            next: 'https://api.bitbucket.org/2.0/repositories/org/repo/src/main/?pagelen=100&page=2',
          },
    };
  });

  const result = await checkCompatibility(
    { provider: 'bitbucket.org', owner: 'org', repo: 'repo' },
    'main',
    '',
  );

  assert.equal(result.framework, 'Static HTML');
  assert.equal(result.markerFile, 'page-two.html');
  assert.equal(sourceRequests.length, 2);
});

test('Bitbucket branch pagination rejects a next URL outside the expected repository path before forwarding auth', async (t) => {
  const requests = [];
  const authHeaders = { Authorization: 'Basic private-credential' };
  t.mock.method(globalThis, 'fetch', async (url, options = {}) => {
    requests.push({ href: String(url), options });
    return {
      ok: true,
      json: async () => ({
        values: [{ name: 'main' }],
        next: 'https://api.bitbucket.org/2.0/repositories/attacker/repo/refs/branches?page=2',
      }),
    };
  });

  const branches = await fetchBranches(
    { provider: 'bitbucket.org', owner: 'org', repo: 'repo' },
    authHeaders,
  );

  assert.deepEqual(branches, []);
  assert.equal(requests.length, 1);
  assert.equal(requests[0].options.headers.Authorization, authHeaders.Authorization);
  assert.match(requests[0].href, /\/repositories\/org\/repo\/refs\/branches/);
});

test('Bitbucket file pagination rejects a malicious next URL before forwarding auth', async (t) => {
  const requests = [];
  const authHeaders = { Authorization: 'Basic private-credential' };
  t.mock.method(globalThis, 'fetch', async (url, options = {}) => {
    const href = String(url);
    requests.push({ href, options });
    if (options.method === 'HEAD') return { ok: false };
    return {
      ok: true,
      json: async () => ({
        values: [{ type: 'commit_file', path: 'readme.txt' }],
        next: 'https://attacker.example/steal-token?page=2',
      }),
    };
  });

  const result = await checkCompatibility(
    { provider: 'bitbucket.org', owner: 'org', repo: 'repo' },
    'main',
    '',
    authHeaders,
  );

  assert.equal(result.status, 'incompatible');
  assert.equal(requests.some(({ href }) => href.includes('attacker.example')), false);
  assert.equal(requests.every(({ options }) => options.headers.Authorization === authHeaders.Authorization), true);
});

test('Bitbucket directory pagination rejects a next URL outside the source collection before forwarding auth', async (t) => {
  const requests = [];
  const authHeaders = { Authorization: 'Basic private-credential' };
  t.mock.method(globalThis, 'fetch', async (url, options = {}) => {
    requests.push({ href: String(url), options });
    return {
      ok: true,
      json: async () => ({
        values: [{ type: 'commit_directory', path: 'frontend' }],
        next: 'https://api.bitbucket.org/2.0/repositories/org/repo/refs/branches?page=2',
      }),
    };
  });

  const directories = await listDirectories(
    { provider: 'bitbucket.org', owner: 'org', repo: 'repo' },
    'main',
    '',
    authHeaders,
  );

  assert.deepEqual(directories, []);
  assert.equal(requests.length, 1);
  assert.equal(requests[0].options.headers.Authorization, authHeaders.Authorization);
});

test('stalled marker HEAD requests receive a timeout signal and fail closed', async (t) => {
  let headRequests = 0;
  let everyHeadHadSignal = true;
  t.mock.method(AbortSignal, 'timeout', () => AbortSignal.abort(new DOMException('timed out', 'TimeoutError')));
  t.mock.method(globalThis, 'fetch', async (_url, options = {}) => {
    if (options.method !== 'HEAD') return { ok: true, json: async () => [] };
    headRequests++;
    everyHeadHadSignal &&= Boolean(options.signal);
    if (!options.signal) return { ok: false };
    return new Promise((_resolve, reject) => {
      if (options.signal.aborted) reject(options.signal.reason);
      else options.signal.addEventListener('abort', () => reject(options.signal.reason), { once: true });
    });
  });

  const result = await checkCompatibility(parsedRepo, 'main', '');

  assert.equal(result.status, 'incompatible');
  assert.ok(headRequests > 0);
  assert.equal(everyHeadHadSignal, true);
});

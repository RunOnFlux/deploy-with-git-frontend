import test from 'node:test';
import assert from 'node:assert/strict';

import {
  checkCompatibility,
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

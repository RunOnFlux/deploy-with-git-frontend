import test from 'node:test';
import assert from 'node:assert/strict';

import { checkCompatibility } from '../src/services/repoIntelligenceService.js';

const parsedRepo = {
  provider: 'github.com',
  owner: 'RunOnFlux',
  repo: 'deploy-with-git-samples',
};

const cases = [
  { projectPath: 'dart', markerFile: 'pubspec.yaml', framework: 'Dart' },
  { projectPath: 'elixir', markerFile: 'mix.exs', framework: 'Elixir' },
  { projectPath: 'erlang', markerFile: 'rebar.config', framework: 'Erlang' },
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

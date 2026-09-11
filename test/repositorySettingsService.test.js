import test from 'node:test';
import assert from 'node:assert/strict';

import {
  readRepositorySettings,
  repositorySettingsEqual,
  writeRepositorySettings,
} from '../src/services/repositorySettingsService.js';

test('reads embedded credentials without exposing them in the editable URL', () => {
  assert.deepEqual(readRepositorySettings([
    { key: 'GIT_REPO_URL', value: 'https://deploy%40user:secret%2Ftoken@github.com/org/repo.git' },
  ]), {
    key: 'GIT_REPO_URL',
    url: 'https://github.com/org/repo.git',
    username: 'deploy@user',
    token: 'secret/token',
  });
});

test('writes GitHub tokens separately and preserves unrelated hidden settings', () => {
  const result = writeRepositorySettings([
    { key: 'REPO_URL', value: 'https://github.com/old/repo' },
    { key: 'GIT_TOKEN', value: 'old-secret' },
    { key: 'ORBIT_RUNTIME', value: 'node' },
  ], {
    key: 'REPO_URL',
    url: 'https://github.com/new/repo',
    username: '',
    token: 'new-secret',
  });

  assert.deepEqual(result, [
    { key: 'ORBIT_RUNTIME', value: 'node' },
    { key: 'REPO_URL', value: 'https://github.com/new/repo' },
    { key: 'GIT_TOKEN', value: 'new-secret' },
  ]);
});

test('writes Bitbucket credentials in the runtime-compatible repository URL', () => {
  const result = writeRepositorySettings([], {
    key: 'GIT_REPO_URL',
    url: 'https://bitbucket.org/team/private-repo',
    username: 'deploy-user',
    token: 'app-password',
  });

  assert.equal(result.length, 1);
  const stored = new URL(result[0].value);
  assert.equal(stored.username, 'deploy-user');
  assert.equal(stored.password, 'app-password');
  assert.equal(stored.hostname, 'bitbucket.org');
});

test('repository equality covers URL, username, and token changes', () => {
  const original = { url: 'https://github.com/org/repo', username: '', token: 'one' };
  assert.equal(repositorySettingsEqual(original, { ...original }), true);
  assert.equal(repositorySettingsEqual(original, { ...original, token: 'two' }), false);
});

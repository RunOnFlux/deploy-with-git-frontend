import {
  buildAuthHeaders,
  checkCompatibility,
  checkRepoAccess,
  detectMonorepo,
  detectPortFromRepo,
  fetchBranches,
  listDirectories,
  parseRepoUrl,
  testPrivateAuth,
} from '../../src/services/repoIntelligenceService.js';
import { loadRepoDeploymentConfig } from '../../src/services/repoConfigImportService.js';
import { redactSecrets } from './core.js';

export class RepositoryService {
  async analyze(input) {
    const parsed = parseRepoUrl(input?.url);
    if (!parsed) throw new Error('Repository must be a supported GitHub, GitLab, or Bitbucket HTTPS URL');
    let access = await checkRepoAccess(parsed);
    let headers = {};
    if (access !== 'public') {
      if (!input?.token) return { provider: parsed.provider, access: 'credentials_required' };
      const auth = await testPrivateAuth(parsed, input.username || '', input.token);
      if (!auth.success) throw new Error(auth.error || 'Repository authentication failed');
      access = 'private';
      headers = buildAuthHeaders(parsed, input.username || '', input.token);
    }
    const branchInput = input.branch || 'main';
    const branches = await fetchBranches(parsed, headers);
    const branch = input.branch || branches.find((candidate) => candidate.isDefault)?.name || branchInput;
    const projectPath = input.subdirectory || '';
    const [compatibility, port, monorepo, importedConfig, directories] = await Promise.all([
      checkCompatibility(parsed, branch, projectPath, headers),
      detectPortFromRepo(parsed, branch, projectPath, headers),
      detectMonorepo(parsed, branch, headers),
      loadRepoDeploymentConfig(parsed, branch, projectPath, headers),
      listDirectories(parsed, branch, '', headers),
    ]);
    return redactSecrets({
      provider: parsed.provider,
      owner: parsed.owner,
      repository: parsed.repo,
      access,
      branch,
      branches,
      directories,
      projectPath,
      compatibility,
      detectedPort: port || null,
      monorepo,
      importedConfig,
    });
  }
}

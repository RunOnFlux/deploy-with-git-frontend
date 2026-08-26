/** Parse environment strings while preserving `=` inside values. */
function parseEnvs(envs = []) {
  const result = {};
  for (const env of envs) {
    const idx = env.indexOf('=');
    if (idx > 0) result[env.slice(0, idx)] = env.slice(idx + 1);
  }
  return result;
}

export function extractGitInfo(compose = []) {
  const envs = parseEnvs(compose[0]?.environmentParameters ?? compose[0]?.envs ?? []);
  const rawUrl = envs.GIT_REPO || envs.GIT_REPO_URL || envs.REPO_URL || '';
  const gitBranch = envs.GIT_BRANCH || envs.BRANCH || 'main';
  const appPort = envs.APP_PORT || envs.PORT || null;
  let gitRepo = '';
  if (rawUrl) {
    try {
      const url = new URL(rawUrl);
      url.username = '';
      url.password = '';
      gitRepo = url.toString();
    } catch {
      gitRepo = rawUrl.replace(/^(https?:\/\/)[^@]*@/, '$1');
    }
  }
  return { gitRepo, gitBranch, appPort };
}

export function parseAppData(msg) {
  const compose = msg.compose ?? [];
  const first = compose[0] ?? {};
  const { gitRepo, gitBranch, appPort } = extractGitInfo(compose);
  const isEnterprise = !!(msg.version >= 8 && msg.enterprise);
  return {
    name: msg.name,
    description: msg.description ?? '',
    owner: msg.owner,
    hash: msg.hash,
    height: msg.height ?? 0,
    expire: msg.expire ?? 0,
    instances: msg.instances ?? first.instances ?? 1,
    repotag: first.repotag ?? (isEnterprise && !msg._decryptFailed ? 'runonflux/orbit:latest' : ''),
    gitRepo,
    gitBranch,
    appPort,
    cpu: first.cpu ?? 0,
    ram: first.ram ?? 0,
    hdd: first.hdd ?? 0,
    ports: first.ports ?? [],
    compose,
    isEnterprise,
    _decryptFailed: msg._decryptFailed ?? false,
  };
}

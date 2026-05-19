/**
 * Repo Intelligence Service
 * Handles: URL parsing, public/private detection, branch listing, port/framework
 * auto-detection, monorepo detection, compatibility check, and auth testing.
 */

// ─── URL Parsing ─────────────────────────────────────────────────────────────

/**
 * Parse a Git repository URL into provider/owner/repo.
 * Supports GitHub, GitLab (including subgroups), and Bitbucket.
 */
export function parseRepoUrl(url) {
  if (!url) return null;
  try {
    const u = new URL(url);
    const host = u.hostname.toLowerCase();
    const path = u.pathname.replace(/\.git$/, '').replace(/^\/|\/$/g, '');

    if (host === 'github.com') {
      const parts = path.split('/');
      if (parts.length < 2 || !parts[0] || !parts[1]) return null;
      return { provider: 'github.com', owner: parts[0], repo: parts[1] };
    }

    if (host === 'gitlab.com') {
      const parts = path.split('/');
      if (parts.length < 2 || !parts[parts.length - 1]) return null;
      const repo = parts[parts.length - 1];
      const owner = parts.slice(0, -1).join('/');
      if (!owner) return null;
      return { provider: 'gitlab.com', owner, repo };
    }

    if (host === 'bitbucket.org') {
      const parts = path.split('/');
      if (parts.length < 2 || !parts[0] || !parts[1]) return null;
      return { provider: 'bitbucket.org', owner: parts[0], repo: parts[1] };
    }
  } catch {
    // invalid URL
  }
  return null;
}

// ─── Auth Headers ─────────────────────────────────────────────────────────────

export function buildAuthHeaders(parsed, username, token) {
  if (!token || !parsed) return {};
  if (parsed.provider === 'github.com') return { Authorization: `Bearer ${token}` };
  if (parsed.provider === 'gitlab.com') return { 'PRIVATE-TOKEN': token };
  if (parsed.provider === 'bitbucket.org') {
    const encoded = btoa(`${username || ''}:${token}`);
    return { Authorization: `Basic ${encoded}` };
  }
  return {};
}

// ─── Repo Access Check ────────────────────────────────────────────────────────

/**
 * Returns: 'public' | 'inaccessible' | 'unknown'
 * 'inaccessible' = likely private or doesn't exist
 * 'unknown' = network/rate-limit error
 */
export async function checkRepoAccess(parsed) {
  if (!parsed) return 'unknown';
  try {
    let apiUrl;
    if (parsed.provider === 'github.com') {
      apiUrl = `https://api.github.com/repos/${parsed.owner}/${parsed.repo}`;
    } else if (parsed.provider === 'gitlab.com') {
      apiUrl = `https://gitlab.com/api/v4/projects/${encodeURIComponent(`${parsed.owner}/${parsed.repo}`)}`;
    } else if (parsed.provider === 'bitbucket.org') {
      apiUrl = `https://api.bitbucket.org/2.0/repositories/${parsed.owner}/${parsed.repo}`;
    } else {
      return 'unknown';
    }

    const resp = await fetch(apiUrl, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(8000),
    });

    if (resp.ok) return 'public';
    if (resp.status === 429) return 'unknown'; // rate limited
    if (resp.status === 404 || resp.status === 403 || resp.status === 401) return 'inaccessible';
    return 'unknown';
  } catch {
    return 'unknown';
  }
}

// ─── Branch Listing ───────────────────────────────────────────────────────────

/**
 * Fetch branches from the provider API.
 * Returns [{name, isDefault}], sorted with default branch first.
 */
export async function fetchBranches(parsed, authHeaders = {}) {
  if (!parsed) return [];
  const headers = { Accept: 'application/json', ...authHeaders };

  try {
    if (parsed.provider === 'github.com') {
      const repoResp = await fetch(
        `https://api.github.com/repos/${parsed.owner}/${parsed.repo}`,
        { headers, signal: AbortSignal.timeout(8000) },
      );
      let defaultBranch = 'main';
      if (repoResp.ok) {
        const d = await repoResp.json();
        defaultBranch = d.default_branch || 'main';
      }
      const bResp = await fetch(
        `https://api.github.com/repos/${parsed.owner}/${parsed.repo}/branches?per_page=100`,
        { headers, signal: AbortSignal.timeout(8000) },
      );
      if (!bResp.ok) return [];
      const branches = await bResp.json();
      return sortBranches(branches.map((b) => ({ name: b.name, isDefault: b.name === defaultBranch })));
    }

    if (parsed.provider === 'gitlab.com') {
      const enc = encodeURIComponent(`${parsed.owner}/${parsed.repo}`);
      const projResp = await fetch(`https://gitlab.com/api/v4/projects/${enc}`, { headers, signal: AbortSignal.timeout(8000) });
      let defaultBranch = 'main';
      if (projResp.ok) {
        const d = await projResp.json();
        defaultBranch = d.default_branch || 'main';
      }
      const bResp = await fetch(
        `https://gitlab.com/api/v4/projects/${enc}/repository/branches?per_page=100`,
        { headers, signal: AbortSignal.timeout(8000) },
      );
      if (!bResp.ok) return [];
      const branches = await bResp.json();
      return sortBranches(branches.map((b) => ({ name: b.name, isDefault: b.name === defaultBranch })));
    }

    if (parsed.provider === 'bitbucket.org') {
      const bResp = await fetch(
        `https://api.bitbucket.org/2.0/repositories/${parsed.owner}/${parsed.repo}/refs/branches?pagelen=100`,
        { headers, signal: AbortSignal.timeout(8000) },
      );
      if (!bResp.ok) return [];
      const d = await bResp.json();
      return sortBranches(
        (d.values || []).map((b) => ({
          name: b.name,
          isDefault: b.name === 'main' || b.name === 'master',
        })),
      );
    }

    return [];
  } catch {
    return [];
  }
}

function sortBranches(branches) {
  return [...branches].sort((a, b) => Number(b.isDefault) - Number(a.isDefault));
}

// ─── Raw File Fetching ────────────────────────────────────────────────────────

async function fetchRawFile(parsed, branch, filePath, authHeaders = {}, signal) {
  if (signal?.aborted) return null;
  let url;
  const opts = { signal };

  if (parsed.provider === 'github.com') {
    if (authHeaders.Authorization) {
      url = `https://api.github.com/repos/${parsed.owner}/${parsed.repo}/contents/${filePath}?ref=${encodeURIComponent(branch)}`;
      opts.headers = { Accept: 'application/vnd.github.v3.raw', ...authHeaders };
    } else {
      url = `https://raw.githubusercontent.com/${parsed.owner}/${parsed.repo}/${encodeURIComponent(branch)}/${filePath}`;
      opts.headers = {};
    }
  } else if (parsed.provider === 'gitlab.com') {
    const enc = encodeURIComponent(`${parsed.owner}/${parsed.repo}`);
    const encPath = filePath.split('/').map((s) => encodeURIComponent(s)).join('%2F');
    url = `https://gitlab.com/api/v4/projects/${enc}/repository/files/${encPath}/raw?ref=${encodeURIComponent(branch)}`;
    opts.headers = { ...authHeaders };
  } else if (parsed.provider === 'bitbucket.org') {
    url = `https://bitbucket.org/${parsed.owner}/${parsed.repo}/raw/${encodeURIComponent(branch)}/${filePath}`;
    opts.headers = { ...authHeaders };
  } else {
    return null;
  }

  try {
    const resp = await fetch(url, opts);
    if (!resp.ok) return null;
    return await resp.text();
  } catch {
    return null;
  }
}

async function headCheckFile(parsed, branch, filePath, authHeaders = {}) {
  let url;
  const opts = { method: 'HEAD', headers: { ...authHeaders } };

  if (parsed.provider === 'github.com') {
    if (authHeaders.Authorization) {
      url = `https://api.github.com/repos/${parsed.owner}/${parsed.repo}/contents/${filePath}?ref=${encodeURIComponent(branch)}`;
    } else {
      url = `https://raw.githubusercontent.com/${parsed.owner}/${parsed.repo}/${encodeURIComponent(branch)}/${filePath}`;
      opts.headers = {};
    }
  } else if (parsed.provider === 'gitlab.com') {
    const enc = encodeURIComponent(`${parsed.owner}/${parsed.repo}`);
    const encPath = filePath.split('/').map((s) => encodeURIComponent(s)).join('%2F');
    url = `https://gitlab.com/api/v4/projects/${enc}/repository/files/${encPath}?ref=${encodeURIComponent(branch)}`;
  } else if (parsed.provider === 'bitbucket.org') {
    url = `https://api.bitbucket.org/2.0/repositories/${parsed.owner}/${parsed.repo}/src/${encodeURIComponent(branch)}/${filePath}`;
  } else {
    return false;
  }

  try {
    const resp = await fetch(url, opts);
    return resp.ok;
  } catch {
    return false;
  }
}

// ─── Port Detection ───────────────────────────────────────────────────────────

const FRAMEWORK_PORTS = [
  { dep: 'next', port: 3000, framework: 'Next.js' },
  { dep: 'nuxt', port: 3000, framework: 'Nuxt' },
  { dep: '@nuxtjs/core', port: 3000, framework: 'Nuxt' },
  { dep: '@remix-run/node', port: 3000, framework: 'Remix' },
  { dep: 'astro', port: 4321, framework: 'Astro' },
  { dep: '@astrojs/core', port: 4321, framework: 'Astro' },
  { dep: '@sveltejs/kit', port: 5173, framework: 'SvelteKit' },
  { dep: 'svelte', port: 5173, framework: 'Svelte' },
  { dep: '@angular/core', port: 4200, framework: 'Angular' },
  { dep: 'react-scripts', port: 3000, framework: 'Create React App' },
  { dep: 'vite', port: 5173, framework: 'Vite' },
  { dep: 'gatsby', port: 8000, framework: 'Gatsby' },
  { dep: 'express', port: 3000, framework: 'Express.js' },
  { dep: 'fastify', port: 3000, framework: 'Fastify' },
  { dep: 'koa', port: 3000, framework: 'Koa' },
  { dep: '@nestjs/core', port: 3000, framework: 'NestJS' },
  { dep: 'strapi', port: 1337, framework: 'Strapi' },
  { dep: '@hapi/hapi', port: 3000, framework: 'Hapi' },
];

function detectPortFromPackageJson(content) {
  try {
    const pkg = JSON.parse(content);
    const deps = { ...pkg.dependencies, ...pkg.devDependencies };
    for (const { dep, port, framework } of FRAMEWORK_PORTS) {
      if (deps[dep]) return { port, framework };
    }
    // Check scripts.start for port flag
    const start = pkg.scripts?.start || '';
    const m = start.match(/--port[= ](\d+)|-p\s+(\d+)|PORT=(\d+)/);
    if (m) {
      const p = parseInt(m[1] || m[2] || m[3], 10);
      if (p > 0 && p <= 65535) return { port: p, framework: null };
    }
  } catch {
    // ignore
  }
  return {};
}

function detectPortFromDockerfile(content) {
  for (const line of content.split('\n')) {
    const m = line.trim().match(/^EXPOSE\s+(\d+)/i);
    if (m) {
      const p = parseInt(m[1], 10);
      if (p > 0 && p <= 65535) return { port: p, framework: null };
    }
  }
  return {};
}

function detectPortFromDockerCompose(content) {
  const m = content.match(/[\s\-"'](\d{2,5}):(\d{2,5})/);
  if (m) {
    const p = parseInt(m[2], 10);
    if (p > 0 && p <= 65535) return { port: p, framework: null };
  }
  return {};
}

function detectPortFromEnvFile(content) {
  const m = content.match(/^PORT\s*=\s*(\d+)/m);
  if (m) {
    const p = parseInt(m[1], 10);
    if (p > 0 && p <= 65535) return { port: p, framework: null };
  }
  return {};
}

/**
 * Try to detect the app port from repo files.
 * Returns {port, framework} | null
 */
export async function detectPortFromRepo(parsed, branch, projectPath, authHeaders = {}, signal) {
  if (!parsed) return null;
  const basePath = buildBasePath(projectPath);
  const checks = [
    { file: `${basePath}package.json`, detect: detectPortFromPackageJson },
    { file: `${basePath}Dockerfile`, detect: detectPortFromDockerfile },
    { file: `${basePath}docker-compose.yml`, detect: detectPortFromDockerCompose },
    { file: `${basePath}.env.example`, detect: detectPortFromEnvFile },
    { file: `${basePath}.env.sample`, detect: detectPortFromEnvFile },
  ];
  for (const { file, detect } of checks) {
    if (signal?.aborted) return null;
    const content = await fetchRawFile(parsed, branch, file, authHeaders, signal);
    if (content) {
      const result = detect(content);
      if (result.port) return result;
    }
  }
  return null;
}

// ─── Monorepo Detection ───────────────────────────────────────────────────────

/**
 * Detect monorepo structure.
 * Returns {type, projects: [{name, path}]} | null
 */
export async function detectMonorepo(parsed, branch, authHeaders = {}, signal) {
  if (!parsed) return null;

  const workspaceFiles = [
    'pnpm-workspace.yaml',
    'pnpm-workspace.yml',
    'nx.json',
    'turbo.json',
    'lerna.json',
    'rush.json',
  ];

  for (const file of workspaceFiles) {
    if (signal?.aborted) return null;
    const content = await fetchRawFile(parsed, branch, file, authHeaders, signal);
    if (!content) continue;

    const type = file.replace(/\.(yaml|yml|json)$/, '').replace('-workspace', '');
    const projects = parseMonorepoProjects(file, content);

    if (projects.length === 0) {
      const pkgContent = await fetchRawFile(parsed, branch, 'package.json', authHeaders, signal);
      if (pkgContent) {
        try {
          const pkg = JSON.parse(pkgContent);
          const ws = Array.isArray(pkg.workspaces) ? pkg.workspaces : pkg.workspaces?.packages;
          if (ws?.length) ws.forEach((p) => projects.push({ name: p, path: p }));
        } catch { /* ignore */ }
      }
    }

    return { type, projects: projects.slice(0, 20) };
  }

  // Last chance: check package.json workspaces field alone
  if (signal?.aborted) return null;
  const pkgContent = await fetchRawFile(parsed, branch, 'package.json', authHeaders, signal);
  if (pkgContent) {
    try {
      const pkg = JSON.parse(pkgContent);
      const ws = Array.isArray(pkg.workspaces) ? pkg.workspaces : pkg.workspaces?.packages;
      if (ws?.length) {
        return { type: 'npm', projects: ws.slice(0, 20).map((p) => ({ name: p, path: p })) };
      }
    } catch { /* ignore */ }
  }

  return null;
}

function parseMonorepoProjects(file, content) {
  const projects = [];
  try {
    if (file.endsWith('.json')) {
      const data = JSON.parse(content);
      if (file === 'nx.json' && data.projects) {
        Object.entries(data.projects).forEach(([name, p]) =>
          projects.push({ name, path: typeof p === 'object' ? (p.root || name) : name }),
        );
      } else if (file === 'lerna.json' && data.packages) {
        data.packages.forEach((p) => projects.push({ name: p, path: p }));
      }
      // turbo.json doesn't list packages directly
    } else if (file.startsWith('pnpm-workspace')) {
      const m = content.match(/packages:\s*\n((?:\s+-\s+.+\n?)*)/);
      if (m) {
        const lines = m[1].match(/^\s+-\s+['"]?(.+?)['"]?\s*$/mg) || [];
        lines.forEach((line) => {
          const p = line.replace(/^\s+-\s+['"]?|['"]?\s*$/g, '');
          projects.push({ name: p, path: p });
        });
      }
    }
  } catch { /* ignore */ }
  return projects;
}

// ─── Compatibility Check ──────────────────────────────────────────────────────

const FRAMEWORK_BY_MARKER = {
  'requirements.txt': 'Python',
  'pyproject.toml': 'Python',
  'Pipfile': 'Python',
  'setup.py': 'Python',
  'Cargo.toml': 'Rust',
  'go.mod': 'Go',
  'pom.xml': 'Java',
  'build.gradle': 'Java',
  'composer.json': 'PHP',
  'Gemfile': 'Ruby',
  'Dockerfile': null,
  'index.html': null,
};

/**
 * Returns {status: 'compatible'|'warning'|'incompatible', message, framework, markerFile}
 */
export async function checkCompatibility(parsed, branch, projectPath, authHeaders = {}, signal) {
  if (!parsed) return { status: 'idle', message: '', framework: null };
  const basePath = buildBasePath(projectPath);

  const markerFiles = [
    'package.json',
    'requirements.txt',
    'pyproject.toml',
    'Pipfile',
    'Cargo.toml',
    'go.mod',
    'pom.xml',
    'build.gradle',
    'composer.json',
    'Gemfile',
    'Dockerfile',
    'index.html',
  ].map((f) => `${basePath}${f}`);

  for (const file of markerFiles) {
    if (signal?.aborted) return { status: 'idle', message: '', framework: null };
    const found = await headCheckFile(parsed, branch, file, authHeaders);
    if (found) {
      const basename = file.replace(basePath, '');
      const framework = FRAMEWORK_BY_MARKER[basename] ?? null;
      return { status: 'compatible', message: `Found ${basename}`, framework, markerFile: basename };
    }
  }

  return {
    status: 'incompatible',
    message: 'No recognized project files found. This repo may not be compatible with Orbit.',
    framework: null,
    markerFile: null,
  };
}

// ─── Private Auth Test ────────────────────────────────────────────────────────

/**
 * Test private repo credentials.
 * Returns {success: boolean, error?: string}
 */
export async function testPrivateAuth(parsed, username, token) {
  if (!parsed || !token) return { success: false, error: 'No credentials provided' };
  const authHeaders = buildAuthHeaders(parsed, username, token);

  try {
    let apiUrl;
    if (parsed.provider === 'github.com') {
      apiUrl = `https://api.github.com/repos/${parsed.owner}/${parsed.repo}`;
    } else if (parsed.provider === 'gitlab.com') {
      apiUrl = `https://gitlab.com/api/v4/projects/${encodeURIComponent(`${parsed.owner}/${parsed.repo}`)}`;
    } else if (parsed.provider === 'bitbucket.org') {
      apiUrl = `https://api.bitbucket.org/2.0/repositories/${parsed.owner}/${parsed.repo}`;
    } else {
      return { success: false, error: 'Unsupported provider' };
    }

    const resp = await fetch(apiUrl, {
      headers: { Accept: 'application/json', ...authHeaders },
      signal: AbortSignal.timeout(10000),
    });

    if (resp.ok) return { success: true };
    if (resp.status === 401) return { success: false, error: 'Invalid credentials' };
    if (resp.status === 403) return { success: false, error: 'Access denied' };
    if (resp.status === 404) return { success: false, error: 'Repository not found' };
    return { success: false, error: `Server error (${resp.status})` };
  } catch (err) {
    if (err.name === 'AbortError' || err.name === 'TimeoutError') return { success: false, error: 'Connection timed out' };
    return { success: false, error: err.message || 'Network error' };
  }
}

// ─── Directory Listing ────────────────────────────────────────────────────────

/**
 * List top-level directories at `path` (default: repo root) on a given branch.
 * Used to populate the subdirectory picker dropdown.
 * Returns string[] of directory names.
 */
export async function listDirectories(parsed, branch, path = '', authHeaders = {}) {
  if (!parsed) return [];
  const headers = { Accept: 'application/json', ...authHeaders };

  try {
    if (parsed.provider === 'github.com') {
      const apiPath = path ? `contents/${path}` : 'contents';
      const url = `https://api.github.com/repos/${parsed.owner}/${parsed.repo}/${apiPath}?ref=${encodeURIComponent(branch)}`;
      const resp = await fetch(url, { headers, signal: AbortSignal.timeout(8000) });
      if (!resp.ok) {
        console.warn(`[listDirectories] GitHub API returned ${resp.status} for ${url}`);
        return [];
      }
      const items = await resp.json();
      if (!Array.isArray(items)) {
        console.warn('[listDirectories] GitHub API did not return an array');
        return [];
      }
      
      // Filter directories and return with "/" prefix
      const dirs = items
        .filter((i) => i.type === 'dir')
        .map((i) => i.name)
        .filter((name) => {
          // Filter out common non-app directories
          const ignoreDirs = ['.git', '.github', '.vscode', '.idea', 'node_modules', '.next', '.nuxt', 'dist', 'build', 'out', 'target'];
          return !ignoreDirs.includes(name) && !name.startsWith('.');
        })
        .map((name) => `/${name}`);
      
      return dirs;
    }

    if (parsed.provider === 'gitlab.com') {
      const enc = encodeURIComponent(`${parsed.owner}/${parsed.repo}`);
      const pathParam = path ? `&path=${encodeURIComponent(path)}` : '';
      const url = `https://gitlab.com/api/v4/projects/${enc}/repository/tree?ref=${encodeURIComponent(branch)}${pathParam}`;
      const resp = await fetch(url, { headers, signal: AbortSignal.timeout(8000) });
      if (!resp.ok) {
        console.warn(`[listDirectories] GitLab API returned ${resp.status}`);
        return [];
      }
      const items = await resp.json();
      if (!Array.isArray(items)) {
        console.warn('[listDirectories] GitLab API did not return an array');
        return [];
      }
      
      const dirs = items
        .filter((i) => i.type === 'tree')
        .map((i) => i.name)
        .filter((name) => {
          const ignoreDirs = ['.git', '.github', '.gitlab', '.vscode', '.idea', 'node_modules', '.next', '.nuxt', 'dist', 'build', 'out', 'target'];
          return !ignoreDirs.includes(name) && !name.startsWith('.');
        })
        .map((name) => `/${name}`);
      
      return dirs;
    }

    if (parsed.provider === 'bitbucket.org') {
      const pathSeg = path
        ? `${encodeURIComponent(branch)}/${path}`
        : encodeURIComponent(branch);
      const url = `https://api.bitbucket.org/2.0/repositories/${parsed.owner}/${parsed.repo}/src/${pathSeg}/?pagelen=100`;
      const resp = await fetch(url, { headers, signal: AbortSignal.timeout(8000) });
      if (!resp.ok) {
        console.warn(`[listDirectories] Bitbucket API returned ${resp.status}`);
        return [];
      }
      const data = await resp.json();
      const dirs = (data.values || [])
        .filter((i) => i.type === 'commit_directory')
        .map((i) => {
          const parts = i.path.split('/');
          return parts[parts.length - 1];
        })
        .filter((name) => {
          const ignoreDirs = ['.git', '.github', '.vscode', '.idea', 'node_modules', '.next', '.nuxt', 'dist', 'build', 'out', 'target'];
          return !ignoreDirs.includes(name) && !name.startsWith('.');
        })
        .map((name) => `/${name}`);
      
      return dirs;
    }
  } catch (err) {
    console.warn('[listDirectories] Error fetching directories:', err.message);
  }
  return [];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildBasePath(projectPath) {
  if (!projectPath || projectPath === '/') return '';
  return projectPath.replace(/^\//, '').replace(/\/$/, '') + '/';
}

export { fetchRawFile };

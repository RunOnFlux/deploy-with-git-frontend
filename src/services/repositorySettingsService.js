const REPOSITORY_KEYS = new Set(['GIT_REPO_URL', 'GIT_REPO', 'REPO_URL']);

function cleanRepositoryUrl(rawUrl) {
  try {
    const parsed = new URL(rawUrl);
    parsed.username = '';
    parsed.password = '';
    return parsed.toString().replace(/\/$/, '');
  } catch {
    return rawUrl || '';
  }
}

export function readRepositorySettings(rows = []) {
  const repositoryRow = rows.find(({ key }) => REPOSITORY_KEYS.has(key));
  const tokenRow = rows.find(({ key }) => key === 'GIT_TOKEN');
  let username = '';
  let embeddedToken = '';
  try {
    const parsed = new URL(repositoryRow?.value || '');
    username = decodeURIComponent(parsed.username || '');
    embeddedToken = decodeURIComponent(parsed.password || '');
  } catch {
    // Keep malformed values editable so the user can correct them.
  }
  return {
    key: repositoryRow?.key || 'GIT_REPO_URL',
    url: cleanRepositoryUrl(repositoryRow?.value || ''),
    username,
    token: tokenRow?.value || embeddedToken,
  };
}

export function repositorySettingsEqual(left, right) {
  return (
    (left?.url || '').trim() === (right?.url || '').trim() &&
    (left?.username || '').trim() === (right?.username || '').trim() &&
    (left?.token || '').trim() === (right?.token || '').trim()
  );
}

/** Replace only repository credentials, preserving every unrelated hidden row. */
export function writeRepositorySettings(rows, settings) {
  const preserved = rows.filter(({ key }) => !REPOSITORY_KEYS.has(key) && key !== 'GIT_TOKEN');
  const url = (settings?.url || '').trim();
  const username = (settings?.username || '').trim();
  const token = (settings?.token || '').trim();
  let storedUrl = url;

  // Bitbucket app passwords need their accompanying username. GitHub and GitLab
  // use Orbit's dedicated token variable, which keeps credentials out of the URL.
  let provider = '';
  try { provider = new URL(url).hostname.toLowerCase(); } catch { /* validated before save */ }
  if (provider === 'bitbucket.org' && token && username) {
    const parsed = new URL(url);
    parsed.username = username;
    parsed.password = token;
    storedUrl = parsed.toString();
  }

  const next = [...preserved, { key: settings?.key || 'GIT_REPO_URL', value: storedUrl }];
  if (token && provider !== 'bitbucket.org') next.push({ key: 'GIT_TOKEN', value: token });
  return next;
}

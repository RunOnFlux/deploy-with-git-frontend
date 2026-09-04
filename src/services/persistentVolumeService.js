export const ORBIT_DATA_PATH = '/app';
export const MAX_PERSISTENT_FOLDERS = 8;
export const MAX_CONTAINER_DATA_LENGTH = 200;

const RESERVED_NAMES = new Set(['appdata', 'backup', '.', '..']);
const BLOCKED_PATHS = [
  '/app',
  '/bin',
  '/boot',
  '/dev',
  '/etc',
  '/home',
  '/lib',
  '/lib64',
  '/opt',
  '/proc',
  '/root',
  '/run',
  '/sbin',
  '/sys',
  '/usr',
];
const INVALID_PATH_CHARACTERS = /[<>:"\\|?*;]/;

function hasInvalidPathCharacter(path) {
  return INVALID_PATH_CHARACTERS.test(path) || [...path].some((character) => character.charCodeAt(0) < 32);
}

export function normalizePersistentPath(value) {
  const path = String(value || '').trim();
  if (!path) return '';
  return `/${path.replace(/^\/+/, '').replace(/\/{2,}/g, '/').replace(/\/$/, '')}`;
}

function pathIsAtOrBelow(path, root) {
  return path === root || path.startsWith(`${root}/`);
}

export function persistentFolderError(folder) {
  const name = String(folder?.name || '').trim();
  const rawPath = String(folder?.path || '').trim();
  if (!name) return 'Folder name is required';
  if (name.length > 64 || !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(name) || name.includes('..')) {
    return 'Use 1–64 letters, numbers, dots, hyphens, or underscores; “..” is not allowed';
  }
  if (RESERVED_NAMES.has(name.toLowerCase())) return 'This folder name is reserved by Flux';
  if (!rawPath) return 'Container path is required';
  if (!rawPath.startsWith('/')) return 'Container path must start with /';
  if (rawPath.includes(':') || rawPath.includes('|') || hasInvalidPathCharacter(rawPath)) {
    return 'Container path contains a reserved or invalid character';
  }
  if (rawPath.split('/').some((segment) => segment === '.' || segment === '..')) {
    return 'Container path cannot contain . or .. segments';
  }
  const path = normalizePersistentPath(rawPath);
  if (path === '/') return 'The container root cannot be a persistent folder';
  const blocked = BLOCKED_PATHS.find((root) => pathIsAtOrBelow(path, root));
  if (blocked) {
    return blocked === '/app'
      ? 'The /app tree is reserved for Orbit builds, releases, logs, and caches'
      : `${blocked} is reserved by the Orbit container`;
  }
  return '';
}

export function validatePersistentFolders(folders = []) {
  if (!Array.isArray(folders)) return { valid: false, error: 'Persistent folders must be a list', errors: [] };
  if (folders.length > MAX_PERSISTENT_FOLDERS) {
    return { valid: false, error: `Add at most ${MAX_PERSISTENT_FOLDERS} persistent folders`, errors: [] };
  }

  const errors = folders.map(persistentFolderError);
  const seenNames = new Set();
  const normalizedPaths = [];
  folders.forEach((folder, index) => {
    const name = String(folder?.name || '').trim().toLowerCase();
    const path = normalizePersistentPath(folder?.path);
    if (name && seenNames.has(name) && !errors[index]) errors[index] = 'Folder names must be unique';
    seenNames.add(name);
    if (path) {
      const overlap = normalizedPaths.find((other) =>
        pathIsAtOrBelow(path, other) || pathIsAtOrBelow(other, path));
      if (overlap && !errors[index]) errors[index] = `Container path overlaps ${overlap}`;
      normalizedPaths.push(path);
    }
  });

  let containerData = ORBIT_DATA_PATH;
  if (!errors.some(Boolean) && folders.length) {
    containerData = [
      `g:${ORBIT_DATA_PATH}`,
      ...folders.map((folder) => `m:${String(folder.name).trim()}:${normalizePersistentPath(folder.path)}`),
    ].join('|');
    if (containerData.length > MAX_CONTAINER_DATA_LENGTH) {
      return {
        valid: false,
        error: `Persistent volume definition is ${containerData.length} characters; Flux allows ${MAX_CONTAINER_DATA_LENGTH}`,
        errors,
        containerData,
      };
    }
  }

  return { valid: !errors.some(Boolean), error: '', errors, containerData };
}

export function buildOrbitContainerData(folders = []) {
  const validation = validatePersistentFolders(folders);
  if (!validation.valid) {
    throw new Error(validation.error || validation.errors.find(Boolean) || 'Persistent folder configuration is invalid');
  }
  return validation.containerData;
}

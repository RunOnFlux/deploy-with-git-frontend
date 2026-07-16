import { generatePort } from './deployService';

export const DB_TYPES = {
  postgres: {
    id: 'postgres',
    label: 'PostgreSQL',
    image: 'runonflux/flux-pg-cluster:latest',
    defaultComponentName: 'pg',
    defaultResources: { cpu: 1, ram: 4000, hdd: 20 },
    envKey: 'DATABASE_URL',
  },
  mongodb: {
    id: 'mongodb',
    label: 'MongoDB',
    image: 'runonflux/flux-mongodb-cluster:latest',
    defaultComponentName: 'mongo',
    defaultResources: { cpu: 1, ram: 2000, hdd: 15 },
    envKey: 'MONGO_URL',
  },
  mysql: {
    id: 'mysql',
    label: 'MySQL',
    image: 'runonflux/shared-db:latest-mysql',
    defaultComponentName: 'operator',
    defaultResources: { cpu: 1, ram: 2000, hdd: 15 },
    envKey: 'DATABASE_URL',
  },
  mariadb: {
    id: 'mariadb',
    label: 'MariaDB',
    image: 'runonflux/shared-db:latest-mariadb',
    defaultComponentName: 'operator',
    defaultResources: { cpu: 1, ram: 2000, hdd: 15 },
    envKey: 'DATABASE_URL',
  },
};

export const REDIS_ADDON = {
  id: 'redis',
  label: 'Redis',
  image: 'runonflux/flux-redis-cluster:latest',
  defaultComponentName: 'redis',
  defaultResources: { cpu: 0.5, ram: 1000, hdd: 5 },
  envKey: 'REDIS_URL',
};

const PG_CONTAINER_PORTS = [5432, 5433, 8008, 2379, 2380];
const MONGO_CONTAINER_PORTS = [27017, 3000];
const SHARED_SQL_CONTAINER_PORTS = [3307, 7071, 8008];
const REDIS_CONTAINER_PORTS = [6379, 26379, 6380];

export function isSharedSqlType(type) {
  return type === 'mysql' || type === 'mariadb';
}

export function databaseNeedsName(type) {
  return type === 'postgres' || isSharedSqlType(type);
}

function getDatabaseContainerPorts(type) {
  if (type === 'postgres') return PG_CONTAINER_PORTS;
  if (isSharedSqlType(type)) return SHARED_SQL_CONTAINER_PORTS;
  return MONGO_CONTAINER_PORTS;
}

export function generateSecret(length = 24) {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  const arr = new Uint8Array(length);
  crypto.getRandomValues(arr);
  return Array.from(arr, (b) => chars[b % chars.length]).join('');
}

export function generateDbPorts(type, existingPorts = []) {
  const count = getDatabaseContainerPorts(type).length;
  const used = [...existingPorts];
  const ports = [];
  for (let i = 0; i < count; i++) {
    ports.push(generatePort(used));
    used.push(ports[i]);
  }
  return ports;
}

export function generateRedisPorts(existingPorts = []) {
  const used = [...existingPorts];
  const ports = [];
  for (let i = 0; i < REDIS_CONTAINER_PORTS.length; i++) {
    ports.push(generatePort(used));
    used.push(ports[i]);
  }
  return ports;
}

export function createDefaultDatabaseConfig(type = 'postgres') {
  const meta = DB_TYPES[type] ?? DB_TYPES.postgres;
  return {
    enabled: false,
    type,
    componentName: meta.defaultComponentName,
    dbName: 'appdb',
    password: generateSecret(20),
    replicationPassword: type === 'postgres' ? generateSecret(20) : '',
    sslPassphrase: type === 'postgres' ? generateSecret(16) : '',
    keyfilePassphrase: type === 'mongodb' ? generateSecret(16) : '',
    resources: { ...meta.defaultResources },
    ports: null,
  };
}

export function createDefaultRedisConfig() {
  return {
    enabled: false,
    componentName: REDIS_ADDON.defaultComponentName,
    password: generateSecret(20),
    sslPassphrase: generateSecret(16),
    resources: { ...REDIS_ADDON.defaultResources },
    ports: null,
  };
}

export function buildPostgresCompose({
  componentName,
  resources,
  ports,
  dbName,
  password,
  replicationPassword,
  sslPassphrase,
}) {
  const [pgPort, , patroniPort, etcdClientPort, etcdPeerPort] = ports;

  return {
    name: componentName,
    description: 'PostgreSQL HA cluster',
    repotag: DB_TYPES.postgres.image,
    ports,
    domains: ['', '', '', '', ''],
    environmentParameters: [
      `HOST_POSTGRES_PORT=${pgPort}`,
      `HOST_PATRONI_API_PORT=${patroniPort}`,
      `HOST_ETCD_CLIENT_PORT=${etcdClientPort}`,
      `HOST_ETCD_PEER_PORT=${etcdPeerPort}`,
      `POSTGRES_SUPERUSER_PASSWORD=${password}`,
      `POSTGRES_REPLICATION_PASSWORD=${replicationPassword}`,
      `POSTGRES_DB=${dbName}`,
      'SSL_ENABLED=true',
      `SSL_PASSPHRASE=${sslPassphrase}`,
    ],
    commands: [],
    containerPorts: PG_CONTAINER_PORTS,
    containerData: '/var/lib/postgresql/data',
    cpu: resources.cpu,
    ram: resources.ram,
    hdd: resources.hdd,
    repoauth: '',
    tiered: false,
  };
}

export function buildMongoCompose({
  componentName,
  appName,
  resources,
  ports,
  password,
  keyfilePassphrase,
}) {
  return {
    name: componentName,
    description: 'MongoDB replica set',
    repotag: DB_TYPES.mongodb.image,
    ports,
    domains: ['', ''],
    environmentParameters: [
      `APP_NAME=${appName}`,
      'MONGO_REPLICA_SET_NAME=rs0',
      'MONGO_INITDB_ROOT_USERNAME=admin',
      `MONGO_INITDB_ROOT_PASSWORD=${password}`,
      `MONGO_KEYFILE_PASSPHRASE=${keyfilePassphrase}`,
    ],
    commands: [],
    containerPorts: MONGO_CONTAINER_PORTS,
    containerData: '/data/db',
    cpu: resources.cpu,
    ram: resources.ram,
    hdd: resources.hdd,
    repoauth: '',
    tiered: false,
  };
}

export function buildSharedSqlCompose({
  type,
  componentName,
  resources,
  ports,
  dbName,
  password,
}) {
  const [dbPort, apiPort] = ports;
  const meta = DB_TYPES[type];

  return {
    name: componentName,
    description: `${meta.label} shared database`,
    repotag: meta.image,
    ports,
    domains: ['', '', ''],
    environmentParameters: [
      `INIT_DB_NAME=${dbName || 'appdb'}`,
      `DB_INIT_PASS=${password}`,
      'DB_USER=root',
      `DB_PORT=${dbPort}`,
      `API_PORT=${apiPort}`,
    ],
    commands: [],
    containerPorts: SHARED_SQL_CONTAINER_PORTS,
    containerData: 's:/app/dumps|/app/db',
    cpu: resources.cpu,
    ram: resources.ram,
    hdd: resources.hdd,
    repoauth: '',
    tiered: false,
  };
}

export function buildRedisCompose({
  componentName,
  resources,
  ports,
  password,
  sslPassphrase,
}) {
  const [redisPort, sentinelPort] = ports;

  return {
    name: componentName,
    description: 'Redis HA cluster',
    repotag: REDIS_ADDON.image,
    ports,
    domains: ['', '', ''],
    environmentParameters: [
      `HOST_REDIS_PORT=${redisPort}`,
      `HOST_SENTINEL_PORT=${sentinelPort}`,
      `REDIS_PASSWORD=${password}`,
      `SSL_PASSPHRASE=${sslPassphrase}`,
    ],
    commands: [],
    containerPorts: REDIS_CONTAINER_PORTS,
    containerData: '/var/lib/redis/data',
    cpu: resources.cpu,
    ram: resources.ram,
    hdd: resources.hdd,
    repoauth: '',
    tiered: false,
  };
}

export const DB_MIN_INSTANCES = 3;

/** Flux specs use MB; UI shows GB (÷1000) with sensible rounding. */
export function formatRamMb(mb) {
  if (mb == null) return '—';
  if (mb < 1000) return `${mb} MB`;
  const gb = Math.round((mb / 1000) * 10) / 10;
  const text = Number.isInteger(gb) ? String(gb) : gb.toFixed(1);
  return `${text} GB`;
}

/** Map flux.deploy.schema database.type to wizard DB_TYPES id. */
export function mapFluxDatabaseType(fluxType) {
  if (!fluxType) return null;
  const key = String(fluxType).toLowerCase().trim();
  if (key === 'pg' || key === 'postgres' || key === 'postgresql') return 'postgres';
  if (key === 'mongo' || key === 'mongodb') return 'mongodb';
  if (key === 'mysql') return 'mysql';
  if (key === 'maria' || key === 'mariadb') return 'mariadb';
  return null;
}

/** Map flux.deploy.schema redis.type to the wizard Redis addon. */
export function mapFluxRedisType(fluxType) {
  if (!fluxType) return 'redis';
  const key = String(fluxType).toLowerCase().trim();
  if (key === 'redis' || key === 'cache') return 'redis';
  return null;
}

/**
 * Build wizard database config from flux.deploy.schema `database` block.
 * Generates secrets and ports — never reuse credentials from repo files.
 */
export function databaseConfigFromFluxSchema(dbBlock, appPorts = []) {
  if (!dbBlock || typeof dbBlock !== 'object') return null;

  const type = mapFluxDatabaseType(dbBlock.type);
  if (!type) return null;

  const defaults = createDefaultDatabaseConfig(type);
  const cpu = Number(dbBlock.cpu);
  const ram = parseInt(String(dbBlock.ram ?? ''), 10);
  const hdd = parseInt(String(dbBlock.hdd ?? ''), 10);

  return {
    enabled: true,
    type,
    componentName: defaults.componentName,
    dbName: String(dbBlock.name || defaults.dbName).trim() || defaults.dbName,
    password: generateSecret(20),
    replicationPassword: type === 'postgres' ? generateSecret(20) : '',
    sslPassphrase: type === 'postgres' ? generateSecret(16) : '',
    keyfilePassphrase: type === 'mongodb' ? generateSecret(16) : '',
    resources: {
      cpu: Number.isFinite(cpu) && cpu > 0 ? cpu : defaults.resources.cpu,
      ram: Number.isFinite(ram) && ram >= 128 ? ram : defaults.resources.ram,
      hdd: Number.isFinite(hdd) && hdd >= 1 ? hdd : defaults.resources.hdd,
    },
    ports: generateDbPorts(type, appPorts),
  };
}

/**
 * Build wizard Redis config from flux.deploy.schema `redis` block.
 * Generates secrets and ports; never reuse credentials from repo files.
 */
export function redisConfigFromFluxSchema(redisBlock, appPorts = []) {
  if (!redisBlock || typeof redisBlock !== 'object') return null;
  if (!mapFluxRedisType(redisBlock.type)) return null;

  const defaults = createDefaultRedisConfig();
  const cpu = Number(redisBlock.cpu);
  const ram = parseInt(String(redisBlock.ram ?? ''), 10);
  const hdd = parseInt(String(redisBlock.hdd ?? ''), 10);
  const componentName = String(redisBlock.componentName || redisBlock.name || defaults.componentName)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '') || defaults.componentName;

  return {
    enabled: true,
    componentName,
    password: generateSecret(20),
    sslPassphrase: generateSecret(16),
    resources: {
      cpu: Number.isFinite(cpu) && cpu > 0 ? cpu : defaults.resources.cpu,
      ram: Number.isFinite(ram) && ram >= 128 ? ram : defaults.resources.ram,
      hdd: Number.isFinite(hdd) && hdd >= 1 ? hdd : defaults.resources.hdd,
    },
    ports: generateRedisPorts(appPorts),
  };
}

export function getDatabaseConnectionString({ type, componentName, password, dbName }) {
  if (type === 'mongodb') {
    const encoded = encodeURIComponent(password);
    return `mongodb://admin:${encoded}@${componentName}:27017/?directConnection=true&authSource=admin`;
  }

  const encoded = encodeURIComponent(password);
  const db = dbName || 'appdb';
  if (isSharedSqlType(type)) {
    return `mysql://root:${encoded}@${componentName}:3307/${db}`;
  }
  return `postgresql://postgres:${encoded}@${componentName}:5433/${db}?sslmode=require`;
}

export function getDatabaseEnvVar({ type, componentName, password, dbName }) {
  const meta = DB_TYPES[type] ?? DB_TYPES.postgres;
  return {
    key: meta.envKey,
    value: getDatabaseConnectionString({ type, componentName, password, dbName }),
  };
}

export function getRedisConnectionString({ componentName, password }) {
  const encoded = encodeURIComponent(password);
  return `rediss://:${encoded}@${componentName}:6380`;
}

export function getRedisEnvVar({ componentName, password }) {
  return {
    key: REDIS_ADDON.envKey,
    value: getRedisConnectionString({ componentName, password }),
  };
}

export function redactConnectionPassword(connectionString) {
  if (!connectionString) return '';
  return String(connectionString).replace(/\/\/([^/@]*:)?([^@/?#]+)@/, (_match, userPart = '') => `//${userPart}********@`);
}

export function buildDatabaseCompose(database, appName) {
  if (!database?.enabled) return null;

  const { type, componentName, resources, ports, dbName, password, replicationPassword, sslPassphrase, keyfilePassphrase } = database;

  if (type === 'mongodb') {
    return buildMongoCompose({
      componentName,
      appName,
      resources,
      ports,
      password,
      keyfilePassphrase,
    });
  }

  if (isSharedSqlType(type)) {
    return buildSharedSqlCompose({
      type,
      componentName,
      resources,
      ports,
      dbName,
      password,
    });
  }

  return buildPostgresCompose({
    componentName,
    resources,
    ports,
    dbName,
    password,
    replicationPassword,
    sslPassphrase,
  });
}

export function getDatabaseTypeForCompose(compose) {
  const image = String(compose?.repotag ?? '').toLowerCase();
  const name = String(compose?.name ?? '').toLowerCase();

  for (const [type, meta] of Object.entries(DB_TYPES)) {
    if (image === meta.image.toLowerCase()) return type;
  }
  if (image.includes('flux-pg-cluster') || name === 'pg') return 'postgres';
  if (image.includes('flux-mongodb-cluster') || name === 'mongo') return 'mongodb';
  if (image.includes('runonflux/shared-db')) {
    return image.includes('mariadb') ? 'mariadb' : 'mysql';
  }
  if (name === 'mysql') return 'mysql';
  if (name === 'maria' || name === 'mariadb') return 'mariadb';
  return null;
}

export function isDatabaseCompose(compose) {
  return getDatabaseTypeForCompose(compose) !== null;
}

export function buildRedisAddonCompose(redis) {
  if (!redis?.enabled) return null;

  const { componentName, resources, ports, password, sslPassphrase } = redis;

  return buildRedisCompose({
    componentName,
    resources,
    ports,
    password,
    sslPassphrase,
  });
}

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
};

const PG_CONTAINER_PORTS = [5432, 5433, 8008, 2379, 2380];
const MONGO_CONTAINER_PORTS = [27017, 3000];

export function generateSecret(length = 24) {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  const arr = new Uint8Array(length);
  crypto.getRandomValues(arr);
  return Array.from(arr, (b) => chars[b % chars.length]).join('');
}

export function generateDbPorts(type, existingPorts = []) {
  const count = type === 'postgres' ? PG_CONTAINER_PORTS.length : MONGO_CONTAINER_PORTS.length;
  const used = [...existingPorts];
  const ports = [];
  for (let i = 0; i < count; i++) {
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

export function buildPostgresCompose({
  componentName,
  resources,
  ports,
  dbName,
  password,
  replicationPassword,
  sslPassphrase,
}) {
  const [pgPort, proxyPort, patroniPort, etcdClientPort, etcdPeerPort] = ports;

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

export const DB_MIN_INSTANCES = 3;

export function getDatabaseConnectionString({ type, componentName, password, dbName }) {
  if (type === 'mongodb') {
    const encoded = encodeURIComponent(password);
    return `mongodb://admin:${encoded}@${componentName}:27017/?directConnection=true&authSource=admin`;
  }

  const encoded = encodeURIComponent(password);
  const db = dbName || 'appdb';
  return `postgresql://postgres:${encoded}@${componentName}:5433/${db}?sslmode=require`;
}

export function getDatabaseEnvVar({ type, componentName, password, dbName }) {
  const meta = DB_TYPES[type] ?? DB_TYPES.postgres;
  return {
    key: meta.envKey,
    value: getDatabaseConnectionString({ type, componentName, password, dbName }),
  };
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

import { McpServer } from '@modelcontextprotocol/server';
import { z } from 'zod';

import { publicPlanList, redactSecrets } from '../orbit/core.js';

const repositorySchema = z.object({
  url: z.string().url(),
  branch: z.string().optional(),
  subdirectory: z.string().optional(),
  private: z.boolean().optional(),
  username: z.string().optional(),
  token: z.string().optional(),
}).strict();

const deploymentSchema = z.object({
  appName: z.string().min(3).max(32),
  repository: repositorySchema,
  plan: z.union([
    z.enum(['free', 'standard', 'pro', 'custom']),
    z.object({
      id: z.enum(['free', 'standard', 'pro', 'custom']),
      cpu: z.number().positive().optional(),
      ram: z.number().positive().optional(),
      hdd: z.number().positive().optional(),
      instances: z.number().int().min(1).max(3).optional(),
    }).strict(),
  ]),
  port: z.union([z.number().int(), z.string()]),
  additionalPort: z.union([z.number().int(), z.string()]).optional(),
  contactEmail: z.string().email(),
  billingPeriod: z.union([z.literal(1), z.literal(3), z.literal(6), z.literal(12), z.object({ months: z.number() }).strict()]).default(1),
  customDomain: z.string().optional(),
  geolocation: z.array(z.object({ code: z.string(), type: z.enum(['allowed', 'forbidden']) })).optional(),
  environment: z.array(z.object({ key: z.string(), value: z.string() })).optional(),
  persistentFolders: z.array(z.object({
    name: z.string().min(1).max(64),
    path: z.string().min(2).max(160),
  }).strict()).max(8).optional(),
  pollingInterval: z.string().optional(),
  runtime: z.string().optional(),
  runtimeVersion: z.string().optional(),
  buildCommand: z.string().optional(),
  runCommand: z.string().optional(),
  installCommand: z.string().optional(),
  prPreviewEnabled: z.boolean().optional(),
  enterprise: z.boolean().optional(),
  webhookSecret: z.string().optional(),
  apiKey: z.string().optional(),
  database: z.record(z.string(), z.unknown()).optional(),
  redis: z.record(z.string(), z.unknown()).optional(),
}).strict();

export function toolResult(value, { isError = false } = {}) {
  const safe = redactSecrets(value);
  return {
    content: [{ type: 'text', text: JSON.stringify(safe) }],
    structuredContent: safe,
    ...(isError ? { isError: true } : {}),
  };
}

export function createOrbitMcpServer({ authInfo, services = {}, version = '1.0.0' } = {}) {
  const server = new McpServer({ name: 'orbit', version });
  const rawRegisterTool = server.registerTool.bind(server);
  server.registerTool = (name, definition, handler) => rawRegisterTool(name, definition, async (...args) => {
    try {
      return await handler(...args);
    } catch (error) {
      return toolResult({ error: { code: error?.code || 'tool_error', message: error?.message || 'Tool request failed' } }, { isError: true });
    }
  });

  server.registerTool(
    'list_plans',
    {
      title: 'List Orbit deployment plans',
      description: 'List the current Orbit resource plans. Indicates the $0.99 additional-app profile when applicable.',
      inputSchema: z.object({}),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async () => {
      const hasExistingApp = services.hasExistingApp
        ? await services.hasExistingApp(authInfo)
        : false;
      return toolResult({ plans: publicPlanList({ hasExistingApp }) });
    },
  );

  server.registerTool(
    'analyze_repository',
    {
      title: 'Analyze a Git repository',
      description: 'Inspect a GitHub, GitLab, or Bitbucket repository using Orbit’s deployment compatibility rules.',
      inputSchema: z.object({
        url: z.string().url(),
        branch: z.string().optional(),
        subdirectory: z.string().optional(),
        username: z.string().optional(),
        token: z.string().optional().describe('Private repository token. Never returned by Orbit.'),
      }),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async (input) => toolResult(await services.analyzeRepository(authInfo, input)),
  );

  server.registerTool(
    'list_apps',
    {
      title: 'List Orbit apps',
      description: 'List Orbit applications owned by the authenticated Firebase user’s Flux identity.',
      inputSchema: z.object({}),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async () => toolResult({ apps: await services.listApps(authInfo) }),
  );

  server.registerTool(
    'get_app',
    {
      title: 'Get an Orbit app',
      description: 'Get the sanitized specification of an Orbit app owned by the authenticated user.',
      inputSchema: z.object({ appName: z.string().min(3).max(32) }),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async ({ appName }) => toolResult({ app: await services.getApp(authInfo, appName) }),
  );

  server.registerTool(
    'get_instances',
    {
      title: 'Get app instances',
      description: 'List Flux nodes currently assigned to an owned Orbit app.',
      inputSchema: z.object({ appName: z.string().min(3).max(32) }),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async ({ appName }) => toolResult({ instances: await services.getInstances(authInfo, appName) }),
  );

  server.registerTool(
    'get_deployment_status',
    {
      title: 'Get deployment status',
      description: 'Read blockchain registration and live deployment state for an owned Orbit app.',
      inputSchema: z.object({ appName: z.string().min(3).max(32), txid: z.string().optional() }),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async ({ appName, txid }) => toolResult(await services.getDeploymentStatus(authInfo, appName, txid)),
  );

  server.registerTool(
    'get_network_capacity',
    {
      title: 'Get Flux capacity',
      description: 'Count Flux nodes capable of hosting the requested resources.',
      inputSchema: z.object({
        cpu: z.number().nonnegative().default(0),
        ram: z.number().nonnegative().default(0).describe('RAM in GB'),
        hdd: z.number().nonnegative().default(0).describe('Storage in GB'),
        enterprise: z.boolean().default(false),
      }),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async (input) => toolResult(await services.getNetworkCapacity(authInfo, input)),
  );

  server.registerTool(
    'validate_deployment',
    {
      title: 'Validate an Orbit deployment',
      description: 'Analyze the repository and produce an authoritative, sanitized deployment preview without registering an app.',
      inputSchema: deploymentSchema,
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async (input) => toolResult(await services.validateDeployment(authInfo, input)),
  );

  server.registerTool(
    'deploy_app',
    {
      title: 'Deploy an app with Orbit',
      description: 'Revalidate, Firebase-sign, register, and test-install an Orbit app. Terms must be explicitly accepted.',
      inputSchema: deploymentSchema.extend({
        termsAccepted: z.literal(true),
        createCheckout: z.boolean().default(false).describe('Create Stripe checkout from this call’s authoritative registration result.'),
      }),
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true },
    },
    async (input) => toolResult(await services.deployApp(authInfo, input)),
  );

  server.registerTool(
    'create_stripe_checkout',
    {
      title: 'Create Stripe checkout',
      description: 'Recalculate authoritative pricing and create a Stripe checkout URL for a registered Orbit deployment.',
      inputSchema: z.object({
        appName: z.string().min(3).max(32),
        txid: z.string().min(8).max(128),
        operation: z.enum(['registration', 'update', 'renewal']).default('registration'),
      }),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async (input) => toolResult(await services.createStripeCheckout(authInfo, input)),
  );

  server.registerTool(
    'get_logs',
    {
      title: 'Get Orbit app logs',
      description: 'Read a bounded tail of build, app, or container logs from a node assigned to an owned app.',
      inputSchema: z.object({
        appName: z.string().min(3).max(32),
        nodeIp: z.string().optional(),
        type: z.enum(['build', 'app', 'container']).default('container'),
        lines: z.number().int().min(1).max(500).default(100),
      }),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async (input) => toolResult(await services.getLogs(authInfo, input)),
  );

  server.registerTool(
    'trigger_build',
    {
      title: 'Pull and build an Orbit app',
      description: 'Trigger Orbit’s webhook build on a node assigned to an owned app.',
      inputSchema: z.object({
        appName: z.string().min(3).max(32), nodeIp: z.string().optional(), hardRedeploy: z.boolean().default(false),
      }),
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true },
    },
    async (input) => toolResult(await services.triggerBuild(authInfo, input)),
  );

  server.registerTool(
    'control_instance',
    {
      title: 'Control an Orbit app instance',
      description: 'Redeploy, restart, start, stop, pause, unpause, or remove a node instance belonging to an owned app.',
      inputSchema: z.object({
        appName: z.string().min(3).max(32),
        nodeIp: z.string().optional(),
        action: z.enum(['redeploy', 'hard-redeploy', 'restart', 'start', 'stop', 'pause', 'unpause', 'remove']),
      }),
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true },
    },
    async (input) => toolResult(await services.controlInstance(authInfo, input)),
  );

  server.registerTool(
    'update_app',
    {
      title: 'Update an Orbit app',
      description: 'Apply constrained configuration changes to an owned app while preserving its subscription and hidden settings.',
      inputSchema: z.object({
        appName: z.string().min(3).max(32),
        changes: z.object({
          customDomain: z.string().optional(),
          orbitSettings: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).optional(),
          environment: z.array(z.object({ key: z.string(), value: z.string() })).optional(),
          geolocation: z.array(z.object({ code: z.string(), type: z.enum(['allowed', 'forbidden']) })).optional(),
          resources: z.object({ cpu: z.number(), ram: z.number(), hdd: z.number(), instances: z.number() }).optional(),
        }),
        createCheckout: z.boolean().default(false).describe('Create Stripe checkout from this call’s authoritative update result.'),
      }),
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true },
    },
    async (input) => toolResult(await services.updateApp(authInfo, input)),
  );

  server.registerTool(
    'renew_app',
    {
      title: 'Renew an Orbit app',
      description: 'Register a paid subscription extension for an owned Orbit app.',
      inputSchema: z.object({
        appName: z.string().min(3).max(32),
        extensionMonths: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(6), z.literal(12)]),
        createCheckout: z.boolean().default(false).describe('Create Stripe checkout from the authoritative renewal result.'),
      }),
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true },
    },
    async (input) => toolResult(await services.renewApp(authInfo, input)),
  );

  return server;
}

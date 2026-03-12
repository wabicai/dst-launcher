import { z } from 'zod';
import { createRemoteDeployPath, DEFAULT_PROJECT_SLUG } from '../utils/project';

export const TargetTypeSchema = z.enum(['local', 'ssh']);
export const ProjectStatusSchema = z.enum(['idle', 'running', 'stopped', 'error', 'unknown']);
export const ProjectActionSchema = z.enum([
  'deploy',
  'start',
  'stop',
  'restart',
  'backup',
  'update',
  'check-ports',
  'ensure-firewall',
  'prefetch-mods',
]);

export const LocalTargetConfigSchema = z.object({
  type: z.literal('local'),
  dockerContext: z.string().default('desktop-linux'),
});

export const SshTargetConfigSchema = z.object({
  type: z.literal('ssh'),
  host: z.string().min(1, '远程主机不能为空'),
  port: z.number().int().min(1).max(65535).default(22),
  username: z.string().min(1, '远程用户名不能为空'),
  privateKeyPath: z.string().min(1, 'SSH 私钥路径不能为空'),
  remotePath: z.string().default(createRemoteDeployPath(DEFAULT_PROJECT_SLUG)),
  dockerContext: z.string().optional(),
});

export const TargetConfigSchema = z.discriminatedUnion('type', [
  LocalTargetConfigSchema,
  SshTargetConfigSchema,
]);

export const ShardConfigSchema = z.object({
  shardName: z.string().min(1),
  isMaster: z.boolean(),
  serverPort: z.number().int().min(1).max(65535),
  masterServerPort: z.number().int().min(1).max(65535),
  authenticationPort: z.number().int().min(1).max(65535),
  bindIp: z.string().default('0.0.0.0'),
});

export const ClusterConfigSchema = z.object({
  clusterName: z.string().min(1, '房间名不能为空'),
  clusterDescription: z.string().default(''),
  clusterPassword: z.string().default(''),
  clusterToken: z.string().default(''),
  clusterIntention: z.enum(['cooperative', 'competitive', 'social', 'madness']).default('cooperative'),
  gameMode: z.enum(['survival', 'endless', 'wilderness']).default('survival'),
  maxPlayers: z.number().int().min(1).max(64).default(6),
  pvp: z.boolean().default(false),
  pauseWhenEmpty: z.boolean().default(true),
  offlineCluster: z.boolean().default(false),
  modCollection: z.string().default(''),
  modIds: z.array(z.string()).default([]),
  adminIds: z.array(z.string()).default([]),
  master: ShardConfigSchema,
  caves: ShardConfigSchema,
});

export const FirewallProviderSchema = z.enum(['none', 'ufw', 'unknown']);

export const ModEntryTypeSchema = z.enum(['mod', 'collection']);
export const ModEntrySourceSchema = z.enum(['search', 'recommendation', 'import', 'collection']);
export const ProjectModPrefetchStateSchema = z.enum(['not_added', 'added', 'success', 'failed']);

export const ModCatalogItemSchema = z.object({
  workshopId: z.string(),
  type: ModEntryTypeSchema.default('mod'),
  title: z.string(),
  author: z.string().default(''),
  description: z.string().default(''),
  previewUrl: z.string().default(''),
  sourceUrl: z.string().default(''),
  tags: z.array(z.string()).default([]),
  updatedAt: z.string().nullable().default(null),
  subscriptions: z.number().int().min(0).default(0),
  favorited: z.number().int().min(0).default(0),
  views: z.number().int().min(0).default(0),
  collectionMemberIds: z.array(z.string()).default([]),
});

export const ModSearchResponseSchema = z.object({
  query: z.string(),
  page: z.number().int().min(1),
  items: z.array(ModCatalogItemSchema),
  hasMore: z.boolean().default(false),
});

export const ModImportRequestSchema = z.object({
  value: z.string().min(1, '请输入模组链接、合集链接或 Workshop ID'),
});

export const ModImportResultSchema = z.object({
  query: z.string(),
  type: ModEntryTypeSchema,
  items: z.array(ModCatalogItemSchema),
  message: z.string().default(''),
});

export const ProjectModPrefetchStatusSchema = z.object({
  state: ProjectModPrefetchStateSchema,
  message: z.string().default(''),
  updatedAt: z.string().nullable().default(null),
});

export const ProjectModEntryInputSchema = z.object({
  workshopId: z.string(),
  type: ModEntryTypeSchema.default('mod'),
  source: ModEntrySourceSchema,
  enabled: z.boolean().default(true),
  order: z.number().int().min(0).default(0),
});

export const ProjectModEntrySchema = z.object({
  id: z.string(),
  projectId: z.string(),
  workshopId: z.string(),
  type: ModEntryTypeSchema,
  source: ModEntrySourceSchema,
  enabled: z.boolean(),
  order: z.number().int().min(0),
  prefetch: ProjectModPrefetchStatusSchema,
  catalog: ModCatalogItemSchema,
  collectionMembers: z.array(ModCatalogItemSchema).default([]),
});

export const ProjectModsUpdateSchema = z.object({
  entries: z.array(ProjectModEntryInputSchema).default([]),
});

export const ProjectModsSummarySchema = z.object({
  totalSelected: z.number().int().min(0).default(0),
  enabledSelected: z.number().int().min(0).default(0),
  collectionId: z.string().default(''),
  standaloneCount: z.number().int().min(0).default(0),
  resolvedModIds: z.array(z.string()).default([]),
  prefetch: ProjectModPrefetchStatusSchema,
});

export const ProjectModsDetailSchema = z.object({
  projectId: z.string(),
  summary: ProjectModsSummarySchema,
  collection: ProjectModEntrySchema.nullable(),
  entries: z.array(ProjectModEntrySchema),
  preview: z.object({
    modsSetup: z.string(),
    collectionId: z.string().default(''),
    modIds: z.array(z.string()).default([]),
  }),
});

export const ModRecommendationBundleSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  items: z.array(ModCatalogItemSchema),
});

export const ProjectNetworkSchema = z.object({
  requiredUdpPorts: z.array(z.number().int().min(1).max(65535)),
  firewallProvider: FirewallProviderSchema,
  firewallSupported: z.boolean(),
  openUdpPorts: z.array(z.number().int().min(1).max(65535)),
  missingUdpPorts: z.array(z.number().int().min(1).max(65535)),
  status: z.enum(['not_applicable', 'ready', 'needs_attention', 'unsupported', 'unknown']),
  detail: z.string().default(''),
});

export const ProjectCreateSchema = z.object({
  name: z.string().min(1, '项目名不能为空'),
  slug: z.string().min(1, '项目 slug 不能为空').regex(/^[a-z0-9-]+$/, 'slug 仅允许小写字母、数字和连字符'),
  description: z.string().default(''),
  target: TargetConfigSchema.default({ type: 'local', dockerContext: 'desktop-linux' }),
  clusterConfig: ClusterConfigSchema.optional(),
});

export const ProjectConfigUpdateSchema = z.object({
  name: z.string().min(1),
  description: z.string().default(''),
  target: TargetConfigSchema,
  clusterConfig: ClusterConfigSchema,
});

export const ProjectSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  slug: z.string(),
  description: z.string(),
  status: ProjectStatusSchema,
  targetType: TargetTypeSchema,
  updatedAt: z.string(),
  lastDeploymentAt: z.string().nullable(),
});

export const BackupRecordSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  filename: z.string(),
  location: z.string(),
  sizeBytes: z.number().int(),
  createdAt: z.string(),
});

export const TaskRunSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  action: ProjectActionSchema,
  status: z.enum(['pending', 'running', 'success', 'failed']),
  message: z.string().default(''),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const ProjectDetailSchema = z.object({
  id: z.string(),
  name: z.string(),
  slug: z.string(),
  description: z.string(),
  status: ProjectStatusSchema,
  target: TargetConfigSchema,
  clusterConfig: ClusterConfigSchema,
  backups: z.array(BackupRecordSchema),
  tasks: z.array(TaskRunSchema),
  deployment: z
    .object({
      id: z.string(),
      composePath: z.string(),
      targetPath: z.string(),
      lastDeployedAt: z.string().nullable(),
    })
    .nullable(),
  network: ProjectNetworkSchema,
  modsSummary: ProjectModsSummarySchema,
  runtime: z.object({
    dockerAvailable: z.boolean(),
    containers: z.array(
      z.object({
        service: z.string(),
        state: z.string(),
        health: z.string().nullable(),
      }),
    ),
  }),
});

export const TargetTestRequestSchema = z.object({
  target: TargetConfigSchema,
});

export const TargetTestResponseSchema = z.object({
  ok: z.boolean(),
  message: z.string(),
  detail: z.string().default(''),
});

export type TargetType = z.infer<typeof TargetTypeSchema>;
export type ProjectStatus = z.infer<typeof ProjectStatusSchema>;
export type ProjectAction = z.infer<typeof ProjectActionSchema>;
export type LocalTargetConfig = z.infer<typeof LocalTargetConfigSchema>;
export type SshTargetConfig = z.infer<typeof SshTargetConfigSchema>;
export type TargetConfig = z.infer<typeof TargetConfigSchema>;
export type ShardConfig = z.infer<typeof ShardConfigSchema>;
export type ClusterConfig = z.infer<typeof ClusterConfigSchema>;
export type FirewallProvider = z.infer<typeof FirewallProviderSchema>;
export type ModEntryType = z.infer<typeof ModEntryTypeSchema>;
export type ModEntrySource = z.infer<typeof ModEntrySourceSchema>;
export type ProjectModPrefetchState = z.infer<typeof ProjectModPrefetchStateSchema>;
export type ModCatalogItem = z.infer<typeof ModCatalogItemSchema>;
export type ModSearchResponse = z.infer<typeof ModSearchResponseSchema>;
export type ModImportRequest = z.infer<typeof ModImportRequestSchema>;
export type ModImportResult = z.infer<typeof ModImportResultSchema>;
export type ProjectModPrefetchStatus = z.infer<typeof ProjectModPrefetchStatusSchema>;
export type ProjectModEntryInput = z.infer<typeof ProjectModEntryInputSchema>;
export type ProjectModEntry = z.infer<typeof ProjectModEntrySchema>;
export type ProjectModsUpdateInput = z.infer<typeof ProjectModsUpdateSchema>;
export type ProjectModsSummary = z.infer<typeof ProjectModsSummarySchema>;
export type ProjectModsDetail = z.infer<typeof ProjectModsDetailSchema>;
export type ModRecommendationBundle = z.infer<typeof ModRecommendationBundleSchema>;
export type ProjectNetwork = z.infer<typeof ProjectNetworkSchema>;
export type ProjectCreateInput = z.infer<typeof ProjectCreateSchema>;
export type ProjectConfigUpdateInput = z.infer<typeof ProjectConfigUpdateSchema>;
export type ProjectSummary = z.infer<typeof ProjectSummarySchema>;
export type BackupRecord = z.infer<typeof BackupRecordSchema>;
export type TaskRun = z.infer<typeof TaskRunSchema>;
export type ProjectDetail = z.infer<typeof ProjectDetailSchema>;
export type TargetTestRequest = z.infer<typeof TargetTestRequestSchema>;
export type TargetTestResponse = z.infer<typeof TargetTestResponseSchema>;

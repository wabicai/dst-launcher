import {
  BackupRecordSchema,
  ClusterConfigSchema,
  ModCatalogItemSchema,
  ModEntrySourceSchema,
  ModEntryTypeSchema,
  ProjectActionSchema,
  ProjectModEntryInputSchema,
  ProjectStatusSchema,
  TargetConfigSchema,
  renderModsSetup,
  toTimestampString,
  type BackupRecord,
  type ClusterConfig,
  type ModCatalogItem,
  type ProjectAction,
  type ProjectConfigUpdateInput,
  type ProjectCreateInput,
  type ProjectDetail,
  type ProjectModEntry,
  type ProjectModEntryInput,
  type ProjectModsDetail,
  type ProjectModsSummary,
  type ProjectStatus,
  type ProjectSummary,
  type TargetConfig,
  type TaskRun,
} from '@dst-launcher/shared';
import type { AppDatabase } from './client';
import type {
  BackupRecordRow,
  ClusterConfigRow,
  DeploymentRow,
  ModCacheRow,
  ProjectModEntryRow,
  ProjectRow,
  TargetRow,
  TaskRunRow,
} from './schema';
import { createId } from '../utils/ids';

function now() {
  return Date.now();
}

export class ProjectRepository {
  constructor(private readonly db: AppDatabase) {}

  async listProjects(): Promise<ProjectSummary[]> {
    const projectRows = this.db
      .prepare(
        `select id, name, slug, description, status, target_id as targetId, created_at as createdAt, updated_at as updatedAt
         from projects
         order by updated_at desc`,
      )
      .all() as ProjectRow[];

    const deploymentRows = this.db
      .prepare(
        `select id, project_id as projectId, compose_path as composePath, target_path as targetPath,
                last_deployed_at as lastDeployedAt, created_at as createdAt, updated_at as updatedAt
         from deployments`,
      )
      .all() as DeploymentRow[];

    const targetRows = this.db
      .prepare(
        `select id, type, config_json as configJson, created_at as createdAt, updated_at as updatedAt
         from targets`,
      )
      .all() as TargetRow[];

    const deploymentMap = new Map(deploymentRows.map((item) => [item.projectId, item]));
    const targetMap = new Map(targetRows.map((item) => [item.id, item]));

    return projectRows.map((project) => ({
      id: project.id,
      name: project.name,
      slug: project.slug,
      description: project.description,
      status: ProjectStatusSchema.parse(project.status),
      targetType: TargetConfigSchema.parse(JSON.parse(targetMap.get(project.targetId)?.configJson ?? '{}')).type,
      updatedAt: toTimestampString(project.updatedAt),
      lastDeploymentAt: deploymentMap.get(project.id)?.lastDeployedAt ? toTimestampString(deploymentMap.get(project.id)!.lastDeployedAt!) : null,
    }));
  }

  async createProject(input: ProjectCreateInput): Promise<string> {
    const clusterConfig = ClusterConfigSchema.parse(input.clusterConfig);
    const timestamp = now();
    const projectId = createId('project');
    const targetId = createId('target');
    const configId = createId('cluster');

    this.db.prepare('insert into targets (id, type, config_json, created_at, updated_at) values (?, ?, ?, ?, ?)').run(targetId, input.target.type, JSON.stringify(input.target), timestamp, timestamp);
    this.db.prepare('insert into projects (id, name, slug, description, status, target_id, created_at, updated_at) values (?, ?, ?, ?, ?, ?, ?, ?)').run(projectId, input.name, input.slug, input.description, 'idle', targetId, timestamp, timestamp);
    this.db.prepare('insert into cluster_configs (id, project_id, config_json, created_at, updated_at) values (?, ?, ?, ?, ?)').run(configId, projectId, JSON.stringify(clusterConfig), timestamp, timestamp);

    await this.syncProjectModEntriesFromClusterConfig(projectId, clusterConfig);
    return projectId;
  }

  async updateProject(projectId: string, input: ProjectConfigUpdateInput): Promise<void> {
    const existing = await this.getProjectRows(projectId);
    const existingConfig = ClusterConfigSchema.parse(JSON.parse(existing.clusterConfig.configJson));
    const timestamp = now();

    this.db.prepare('update projects set name = ?, description = ?, updated_at = ? where id = ?').run(input.name, input.description, timestamp, projectId);
    this.db.prepare('update targets set type = ?, config_json = ?, updated_at = ? where id = ?').run(input.target.type, JSON.stringify(input.target), timestamp, existing.project.targetId);
    this.db.prepare('update cluster_configs set config_json = ?, updated_at = ? where project_id = ?').run(JSON.stringify(input.clusterConfig), timestamp, projectId);

    if (didRawModsChange(existingConfig, input.clusterConfig)) {
      await this.syncProjectModEntriesFromClusterConfig(projectId, input.clusterConfig);
    }
  }

  async setProjectStatus(projectId: string, status: ProjectStatus) {
    this.db.prepare('update projects set status = ?, updated_at = ? where id = ?').run(status, now(), projectId);
  }

  async upsertDeployment(projectId: string, composePath: string, targetPath: string, deployed = false) {
    const existing = this.db
      .prepare(
        `select id, project_id as projectId, compose_path as composePath, target_path as targetPath,
                last_deployed_at as lastDeployedAt, created_at as createdAt, updated_at as updatedAt
         from deployments where project_id = ?`,
      )
      .get(projectId) as DeploymentRow | undefined;
    const timestamp = now();

    if (existing) {
      this.db.prepare('update deployments set compose_path = ?, target_path = ?, updated_at = ?, last_deployed_at = ? where project_id = ?').run(composePath, targetPath, timestamp, deployed ? timestamp : existing.lastDeployedAt, projectId);
      return;
    }

    this.db.prepare('insert into deployments (id, project_id, compose_path, target_path, last_deployed_at, created_at, updated_at) values (?, ?, ?, ?, ?, ?, ?)').run(createId('deploy'), projectId, composePath, targetPath, deployed ? timestamp : null, timestamp, timestamp);
  }

  async touchDeployment(projectId: string) {
    const timestamp = now();
    this.db.prepare('update deployments set last_deployed_at = ?, updated_at = ? where project_id = ?').run(timestamp, timestamp, projectId);
  }

  async createTask(projectId: string, action: ProjectAction, message: string): Promise<TaskRun> {
    const timestamp = now();
    const id = createId('task');
    this.db.prepare('insert into task_runs (id, project_id, action, status, message, created_at, updated_at) values (?, ?, ?, ?, ?, ?, ?)').run(id, projectId, action, 'running', message, timestamp, timestamp);
    return {
      id,
      projectId,
      action: ProjectActionSchema.parse(action),
      status: 'running',
      message,
      createdAt: toTimestampString(timestamp),
      updatedAt: toTimestampString(timestamp),
    };
  }

  async updateTask(taskId: string, status: TaskRun['status'], message: string) {
    const timestamp = now();
    this.db.prepare('update task_runs set status = ?, message = ?, updated_at = ? where id = ?').run(status, message, timestamp, taskId);
  }

  async addBackup(projectId: string, filename: string, location: string, sizeBytes: number): Promise<BackupRecord> {
    const timestamp = now();
    const id = createId('backup');
    this.db.prepare('insert into backup_records (id, project_id, filename, location, size_bytes, created_at) values (?, ?, ?, ?, ?, ?)').run(id, projectId, filename, location, sizeBytes, timestamp);
    return BackupRecordSchema.parse({
      id,
      projectId,
      filename,
      location,
      sizeBytes,
      createdAt: toTimestampString(timestamp),
    });
  }

  async removeBackupRecord(backupId: string) {
    this.db.prepare('delete from backup_records where id = ?').run(backupId);
  }

  async upsertModCacheItems(items: ModCatalogItem[]) {
    const timestamp = now();
    const statement = this.db.prepare(
      `insert into mod_cache (
        workshop_id, type, title, author, description, preview_url, source_url, tags_json,
        steam_updated_at, subscriptions, favorited, views, collection_members_json, created_at, updated_at
      ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      on conflict(workshop_id) do update set
        type = excluded.type,
        title = excluded.title,
        author = excluded.author,
        description = excluded.description,
        preview_url = excluded.preview_url,
        source_url = excluded.source_url,
        tags_json = excluded.tags_json,
        steam_updated_at = excluded.steam_updated_at,
        subscriptions = excluded.subscriptions,
        favorited = excluded.favorited,
        views = excluded.views,
        collection_members_json = excluded.collection_members_json,
        updated_at = excluded.updated_at`,
    );

    for (const item of items) {
      const parsed = ModCatalogItemSchema.parse(item);
      const existing = this.db.prepare('select created_at as createdAt from mod_cache where workshop_id = ?').get(parsed.workshopId) as { createdAt: number } | undefined;
      statement.run(
        parsed.workshopId,
        parsed.type,
        parsed.title,
        parsed.author,
        parsed.description,
        parsed.previewUrl,
        parsed.sourceUrl,
        JSON.stringify(parsed.tags),
        toUnixTimestamp(parsed.updatedAt),
        parsed.subscriptions,
        parsed.favorited,
        parsed.views,
        JSON.stringify(parsed.collectionMemberIds),
        existing?.createdAt ?? timestamp,
        timestamp,
      );
    }
  }

  async getCachedMods(workshopIds: string[]): Promise<ModCatalogItem[]> {
    const normalizedIds = uniqueStrings(workshopIds);
    if (normalizedIds.length === 0) {
      return [];
    }

    const placeholders = normalizedIds.map(() => '?').join(', ');
    const rows = this.db
      .prepare(
        `select workshop_id as workshopId, type, title, author, description, preview_url as previewUrl,
                source_url as sourceUrl, tags_json as tagsJson, steam_updated_at as steamUpdatedAt,
                subscriptions, favorited, views, collection_members_json as collectionMembersJson,
                created_at as createdAt, updated_at as updatedAt
         from mod_cache where workshop_id in (${placeholders})`,
      )
      .all(...normalizedIds) as ModCacheRow[];

    return rows.map(mapModCacheRow);
  }

  async replaceProjectModEntries(projectId: string, entries: ProjectModEntryInput[]) {
    const detail = await this.getProjectDetail(projectId);
    const normalizedEntries = await this.normalizeProjectModEntries(entries);
    const timestamp = now();

    this.db.prepare('delete from project_mod_entries where project_id = ?').run(projectId);

    const statement = this.db.prepare(
      `insert into project_mod_entries (
        id, project_id, workshop_id, type, source, enabled, sort_order,
        prefetch_state, prefetch_message, prefetched_at, created_at, updated_at
      ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );

    for (const [index, entry] of normalizedEntries.entries()) {
      statement.run(
        createId('pmod'),
        projectId,
        entry.workshopId,
        entry.type,
        entry.source,
        entry.enabled ? 1 : 0,
        index,
        'added',
        '模组已加入项目，尚未预拉取。',
        null,
        timestamp,
        timestamp,
      );
    }

    await this.syncClusterConfigMods(projectId, detail.clusterConfig, normalizedEntries);
  }

  async syncProjectModEntriesFromClusterConfig(projectId: string, clusterConfig: ClusterConfig) {
    const modIds = normalizeWorkshopIds(clusterConfig.modIds);
    const entries: ProjectModEntryInput[] = [];

    if (clusterConfig.modCollection.trim()) {
      entries.push({
        workshopId: clusterConfig.modCollection.trim(),
        type: 'collection',
        source: 'import',
        enabled: true,
        order: 0,
      });
    }

    entries.push(
      ...modIds.map((workshopId, index) => ({
        workshopId,
        type: 'mod' as const,
        source: 'import' as const,
        enabled: true,
        order: index + entries.length,
      })),
    );

    const timestamp = now();
    this.db.prepare('delete from project_mod_entries where project_id = ?').run(projectId);

    const statement = this.db.prepare(
      `insert into project_mod_entries (
        id, project_id, workshop_id, type, source, enabled, sort_order,
        prefetch_state, prefetch_message, prefetched_at, created_at, updated_at
      ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );

    for (const [index, entry] of entries.entries()) {
      const parsed = ProjectModEntryInputSchema.parse(entry);
      statement.run(
        createId('pmod'),
        projectId,
        parsed.workshopId,
        parsed.type,
        parsed.source,
        parsed.enabled ? 1 : 0,
        index,
        'added',
        '模组已加入项目，尚未预拉取。',
        null,
        timestamp,
        timestamp,
      );
    }
  }

  async markProjectModsPrefetch(projectId: string, state: 'added' | 'success' | 'failed', message: string) {
    const timestamp = now();
    this.db.prepare(
      `update project_mod_entries
       set prefetch_state = ?, prefetch_message = ?, prefetched_at = ?, updated_at = ?
       where project_id = ? and enabled = 1`,
    ).run(state, message, timestamp, timestamp, projectId);
  }

  async getProjectModsDetail(projectId: string): Promise<ProjectModsDetail> {
    const { clusterConfig } = await this.getProjectRows(projectId);
    const parsedConfig = ClusterConfigSchema.parse(JSON.parse(clusterConfig.configJson));
    const rows = this.listProjectModEntryRows(projectId);
    return await this.buildProjectModsDetail(projectId, parsedConfig, rows);
  }

  async getProjectDetail(projectId: string): Promise<Omit<ProjectDetail, 'runtime' | 'network'>> {
    const rows = await this.getProjectRows(projectId);
    const backupRows = this.db
      .prepare(
        `select id, project_id as projectId, filename, location, size_bytes as sizeBytes, created_at as createdAt
         from backup_records where project_id = ? order by created_at desc`,
      )
      .all(projectId) as BackupRecordRow[];
    const taskRows = this.db
      .prepare(
        `select id, project_id as projectId, action, status, message, created_at as createdAt, updated_at as updatedAt
         from task_runs where project_id = ? order by created_at desc`,
      )
      .all(projectId) as TaskRunRow[];
    const deployment = this.db
      .prepare(
        `select id, project_id as projectId, compose_path as composePath, target_path as targetPath,
                last_deployed_at as lastDeployedAt, created_at as createdAt, updated_at as updatedAt
         from deployments where project_id = ?`,
      )
      .get(projectId) as DeploymentRow | undefined;
    const clusterConfig = ClusterConfigSchema.parse(JSON.parse(rows.clusterConfig.configJson)) as ClusterConfig;
    const modsDetail = await this.buildProjectModsDetail(projectId, clusterConfig, this.listProjectModEntryRows(projectId));

    return {
      id: rows.project.id,
      name: rows.project.name,
      slug: rows.project.slug,
      description: rows.project.description,
      status: ProjectStatusSchema.parse(rows.project.status),
      target: TargetConfigSchema.parse(JSON.parse(rows.target.configJson)) as TargetConfig,
      clusterConfig,
      backups: backupRows.map((item) =>
        BackupRecordSchema.parse({
          id: item.id,
          projectId: item.projectId,
          filename: item.filename,
          location: item.location,
          sizeBytes: item.sizeBytes,
          createdAt: toTimestampString(item.createdAt),
        }),
      ),
      tasks: taskRows.map((item) => ({
        id: item.id,
        projectId: item.projectId,
        action: ProjectActionSchema.parse(item.action),
        status: item.status as TaskRun['status'],
        message: item.message,
        createdAt: toTimestampString(item.createdAt),
        updatedAt: toTimestampString(item.updatedAt),
      })),
      deployment: deployment
        ? {
            id: deployment.id,
            composePath: deployment.composePath,
            targetPath: deployment.targetPath,
            lastDeployedAt: deployment.lastDeployedAt ? toTimestampString(deployment.lastDeployedAt) : null,
          }
        : null,
      modsSummary: modsDetail.summary,
    };
  }

  async listBackups(projectId: string) {
    return this.db
      .prepare(
        `select id, project_id as projectId, filename, location, size_bytes as sizeBytes, created_at as createdAt
         from backup_records where project_id = ? order by created_at desc`,
      )
      .all(projectId) as BackupRecordRow[];
  }

  private async syncClusterConfigMods(projectId: string, existingConfig: ClusterConfig, entries: ProjectModEntryInput[]) {
    const collectionEntry = entries.find((entry) => entry.type === 'collection' && entry.enabled);
    const cachedMods = await this.getCachedMods(collectionEntry ? [collectionEntry.workshopId] : []);
    const collection = collectionEntry ? cachedMods.find((item) => item.workshopId === collectionEntry.workshopId) : undefined;
    const collectionMemberIds = new Set(collection?.collectionMemberIds ?? []);
    const standaloneModIds = uniqueStrings(
      entries
        .filter((entry) => entry.type === 'mod' && entry.enabled)
        .map((entry) => entry.workshopId)
        .filter((workshopId) => !collectionMemberIds.has(workshopId)),
    );

    const nextConfig: ClusterConfig = {
      ...existingConfig,
      modCollection: collectionEntry?.workshopId ?? '',
      modIds: standaloneModIds,
    };

    this.db.prepare('update cluster_configs set config_json = ?, updated_at = ? where project_id = ?').run(JSON.stringify(nextConfig), now(), projectId);
  }

  private listProjectModEntryRows(projectId: string) {
    return this.db
      .prepare(
        `select id, project_id as projectId, workshop_id as workshopId, type, source, enabled,
                sort_order as sortOrder, prefetch_state as prefetchState, prefetch_message as prefetchMessage,
                prefetched_at as prefetchedAt, created_at as createdAt, updated_at as updatedAt
         from project_mod_entries
         where project_id = ?
         order by sort_order asc, created_at asc`,
      )
      .all(projectId) as ProjectModEntryRow[];
  }

  private async buildProjectModsDetail(projectId: string, clusterConfig: ClusterConfig, rows: ProjectModEntryRow[]): Promise<ProjectModsDetail> {
    const allIds = uniqueStrings([
      ...rows.map((item) => item.workshopId),
      ...rows
        .filter((item) => item.type === 'collection')
        .flatMap((item) => this.readCollectionMemberIds(item.workshopId)),
    ]);
    const cachedMods = await this.getCachedMods(allIds);
    const cacheMap = new Map(cachedMods.map((item) => [item.workshopId, item]));

    const collectionRow = rows.find((item) => item.type === 'collection' && item.enabled === 1) ?? null;
    const collectionCatalog = collectionRow ? getCatalog(cacheMap, collectionRow.workshopId, 'collection') : null;
    const collectionMemberIds = collectionCatalog?.collectionMemberIds ?? [];
    const collectionMembers = collectionMemberIds.map((workshopId) => getCatalog(cacheMap, workshopId, 'mod'));

    const standaloneRows = rows.filter((item) => item.type === 'mod' && item.enabled === 1 && !collectionMemberIds.includes(item.workshopId));
    const standaloneEntries = standaloneRows.map((item) => this.toProjectModEntry(projectId, item, getCatalog(cacheMap, item.workshopId, 'mod'), []));
    const collectionEntry = collectionRow && collectionCatalog
      ? this.toProjectModEntry(projectId, collectionRow, collectionCatalog, collectionMembers)
      : null;

    const previewConfig: ClusterConfig = {
      ...clusterConfig,
      modCollection: collectionCatalog?.workshopId ?? '',
      modIds: standaloneEntries.map((item) => item.workshopId),
    };
    const resolvedModIds = uniqueStrings([...collectionMemberIds, ...previewConfig.modIds]);

    return {
      projectId,
      summary: buildProjectModsSummary(collectionEntry, standaloneEntries, resolvedModIds),
      collection: collectionEntry,
      entries: standaloneEntries,
      preview: {
        modsSetup: renderModsSetup(previewConfig),
        collectionId: previewConfig.modCollection,
        modIds: previewConfig.modIds,
      },
    };
  }

  private toProjectModEntry(projectId: string, row: ProjectModEntryRow, catalog: ModCatalogItem, collectionMembers: ModCatalogItem[]): ProjectModEntry {
    return {
      id: row.id,
      projectId,
      workshopId: row.workshopId,
      type: ModEntryTypeSchema.parse(row.type),
      source: ModEntrySourceSchema.parse(row.source),
      enabled: row.enabled === 1,
      order: row.sortOrder,
      prefetch: {
        state: row.prefetchState as ProjectModEntry['prefetch']['state'],
        message: row.prefetchMessage,
        updatedAt: row.prefetchedAt ? toTimestampString(row.prefetchedAt) : null,
      },
      catalog,
      collectionMembers,
    };
  }

  private readCollectionMemberIds(workshopId: string) {
    const row = this.db
      .prepare(
        `select collection_members_json as collectionMembersJson
         from mod_cache where workshop_id = ?`,
      )
      .get(workshopId) as { collectionMembersJson: string } | undefined;

    return row ? parseStringArray(row.collectionMembersJson) : [];
  }

  private async normalizeProjectModEntries(entries: ProjectModEntryInput[]) {
    const parsedEntries = entries.map((entry, index) =>
      ProjectModEntryInputSchema.parse({
        ...entry,
        order: entry.order ?? index,
      }),
    );
    const deduped = new Map<string, ProjectModEntryInput>();

    for (const entry of parsedEntries.sort((left, right) => left.order - right.order)) {
      if (!entry.enabled) {
        continue;
      }
      if (entry.type === 'collection') {
        if (!deduped.has(`collection:${entry.workshopId}`) && !Array.from(deduped.values()).some((item) => item.type === 'collection')) {
          deduped.set(`collection:${entry.workshopId}`, { ...entry, order: deduped.size });
        }
        continue;
      }

      const key = `mod:${entry.workshopId}`;
      if (!deduped.has(key)) {
        deduped.set(key, { ...entry, order: deduped.size });
      }
    }

    const collectionEntry = Array.from(deduped.values()).find((entry) => entry.type === 'collection');
    if (!collectionEntry) {
      return Array.from(deduped.values());
    }

    const collectionCache = (await this.getCachedMods([collectionEntry.workshopId]))[0];
    const collectionMemberIds = new Set(collectionCache?.collectionMemberIds ?? []);

    return Array.from(deduped.values())
      .filter((entry) => entry.type === 'collection' || !collectionMemberIds.has(entry.workshopId))
      .map((entry, index) => ({ ...entry, order: index }));
  }

  private async getProjectRows(projectId: string) {
    const project = this.db
      .prepare(
        `select id, name, slug, description, status, target_id as targetId, created_at as createdAt, updated_at as updatedAt
         from projects where id = ?`,
      )
      .get(projectId) as ProjectRow | undefined;

    if (!project) {
      throw new Error('项目不存在');
    }

    const target = this.db
      .prepare('select id, type, config_json as configJson, created_at as createdAt, updated_at as updatedAt from targets where id = ?')
      .get(project.targetId) as TargetRow | undefined;
    const clusterConfig = this.db
      .prepare('select id, project_id as projectId, config_json as configJson, created_at as createdAt, updated_at as updatedAt from cluster_configs where project_id = ?')
      .get(projectId) as ClusterConfigRow | undefined;

    if (!target || !clusterConfig) {
      throw new Error('项目数据不完整');
    }

    return { project, target, clusterConfig };
  }
}

function buildProjectModsSummary(collection: ProjectModEntry | null, entries: ProjectModEntry[], resolvedModIds: string[]): ProjectModsSummary {
  const enabledEntries = [...(collection ? [collection] : []), ...entries].filter((item) => item.enabled);
  const failedEntry = enabledEntries.find((item) => item.prefetch.state === 'failed');
  const successCount = enabledEntries.filter((item) => item.prefetch.state === 'success').length;
  const latestUpdatedAt = enabledEntries
    .map((item) => item.prefetch.updatedAt)
    .filter((item): item is string => Boolean(item))
    .sort()
    .at(-1) ?? null;

  if (enabledEntries.length === 0) {
    return {
      totalSelected: 0,
      enabledSelected: 0,
      collectionId: '',
      standaloneCount: 0,
      resolvedModIds: [],
      prefetch: {
        state: 'not_added',
        message: '当前项目还没有配置模组。',
        updatedAt: null,
      },
    };
  }

  if (failedEntry) {
    return {
      totalSelected: enabledEntries.length,
      enabledSelected: enabledEntries.length,
      collectionId: collection?.workshopId ?? '',
      standaloneCount: entries.length,
      resolvedModIds,
      prefetch: {
        state: 'failed',
        message: failedEntry.prefetch.message || '最近一次预拉取失败。',
        updatedAt: latestUpdatedAt,
      },
    };
  }

  if (successCount === enabledEntries.length) {
    return {
      totalSelected: enabledEntries.length,
      enabledSelected: enabledEntries.length,
      collectionId: collection?.workshopId ?? '',
      standaloneCount: entries.length,
      resolvedModIds,
      prefetch: {
        state: 'success',
        message: '最近一次预拉取成功。',
        updatedAt: latestUpdatedAt,
      },
    };
  }

  return {
    totalSelected: enabledEntries.length,
    enabledSelected: enabledEntries.length,
    collectionId: collection?.workshopId ?? '',
    standaloneCount: entries.length,
    resolvedModIds,
    prefetch: {
      state: 'added',
      message: '模组已加入项目，尚未预拉取。',
      updatedAt: latestUpdatedAt,
    },
  };
}

function mapModCacheRow(row: ModCacheRow): ModCatalogItem {
  return ModCatalogItemSchema.parse({
    workshopId: row.workshopId,
    type: row.type,
    title: row.title,
    author: row.author,
    description: row.description,
    previewUrl: row.previewUrl,
    sourceUrl: row.sourceUrl,
    tags: parseStringArray(row.tagsJson),
    updatedAt: row.steamUpdatedAt ? toTimestampString(row.steamUpdatedAt) : null,
    subscriptions: row.subscriptions,
    favorited: row.favorited,
    views: row.views,
    collectionMemberIds: parseStringArray(row.collectionMembersJson),
  });
}

function getCatalog(cacheMap: Map<string, ModCatalogItem>, workshopId: string, type: 'mod' | 'collection'): ModCatalogItem {
  return cacheMap.get(workshopId) ?? ModCatalogItemSchema.parse({
    workshopId,
    type,
    title: `Workshop ${workshopId}`,
    sourceUrl: `https://steamcommunity.com/sharedfiles/filedetails/?id=${workshopId}`,
  });
}

function parseStringArray(value: string) {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : [];
  } catch {
    return [];
  }
}

function normalizeWorkshopIds(values: string[]) {
  return uniqueStrings(
    values
      .map((value) => value.trim())
      .filter((value) => /^\d+$/.test(value)),
  );
}

function uniqueStrings(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)));
}

function toUnixTimestamp(value: string | null) {
  if (!value) {
    return null;
  }

  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : null;
}

function didRawModsChange(left: ClusterConfig, right: ClusterConfig) {
  if (left.modCollection.trim() !== right.modCollection.trim()) {
    return true;
  }

  const leftIds = normalizeWorkshopIds(left.modIds);
  const rightIds = normalizeWorkshopIds(right.modIds);
  return leftIds.length !== rightIds.length || leftIds.some((item, index) => item !== rightIds[index]);
}

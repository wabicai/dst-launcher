import {
  BackupRecordSchema,
  ClusterConfigSchema,
  ProjectActionSchema,
  ProjectStatusSchema,
  TargetConfigSchema,
  toTimestampString,
  type BackupRecord,
  type ClusterConfig,
  type ProjectAction,
  type ProjectConfigUpdateInput,
  type ProjectCreateInput,
  type ProjectDetail,
  type ProjectStatus,
  type ProjectSummary,
  type TargetConfig,
  type TaskRun,
} from '@dst-launcher/shared';
import type { AppDatabase } from './client';
import type { BackupRecordRow, ClusterConfigRow, DeploymentRow, ProjectRow, TargetRow, TaskRunRow } from './schema';
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
    const timestamp = now();
    const projectId = createId('project');
    const targetId = createId('target');
    const configId = createId('cluster');

    this.db.prepare('insert into targets (id, type, config_json, created_at, updated_at) values (?, ?, ?, ?, ?)').run(targetId, input.target.type, JSON.stringify(input.target), timestamp, timestamp);
    this.db.prepare('insert into projects (id, name, slug, description, status, target_id, created_at, updated_at) values (?, ?, ?, ?, ?, ?, ?, ?)').run(projectId, input.name, input.slug, input.description, 'idle', targetId, timestamp, timestamp);
    this.db.prepare('insert into cluster_configs (id, project_id, config_json, created_at, updated_at) values (?, ?, ?, ?, ?)').run(configId, projectId, JSON.stringify(input.clusterConfig), timestamp, timestamp);

    return projectId;
  }

  async updateProject(projectId: string, input: ProjectConfigUpdateInput): Promise<void> {
    const existing = await this.getProjectRows(projectId);
    const timestamp = now();

    this.db.prepare('update projects set name = ?, description = ?, updated_at = ? where id = ?').run(input.name, input.description, timestamp, projectId);
    this.db.prepare('update targets set type = ?, config_json = ?, updated_at = ? where id = ?').run(input.target.type, JSON.stringify(input.target), timestamp, existing.project.targetId);
    this.db.prepare('update cluster_configs set config_json = ?, updated_at = ? where project_id = ?').run(JSON.stringify(input.clusterConfig), timestamp, projectId);
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

    return {
      id: rows.project.id,
      name: rows.project.name,
      slug: rows.project.slug,
      description: rows.project.description,
      status: ProjectStatusSchema.parse(rows.project.status),
      target: TargetConfigSchema.parse(JSON.parse(rows.target.configJson)) as TargetConfig,
      clusterConfig: ClusterConfigSchema.parse(JSON.parse(rows.clusterConfig.configJson)) as ClusterConfig,
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

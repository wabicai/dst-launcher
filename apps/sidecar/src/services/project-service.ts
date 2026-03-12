import fs from 'node:fs/promises';
import path from 'node:path';
import { statSync } from 'node:fs';
import {
  ClusterConfigSchema,
  ProjectConfigUpdateSchema,
  ProjectCreateSchema,
  TargetConfigSchema,
  createDefaultClusterConfig,
  createRemoteDeployPath,
  renderComposeFile,
  renderConfigPreview,
  type ClusterConfig,
  type ProjectAction,
  type ProjectConfigUpdateInput,
  type ProjectCreateInput,
  type ProjectDetail,
  type TargetConfig,
} from '@dst-launcher/shared';
import { ProjectRepository } from '../db/repository';
import { EventBus } from './event-bus';
import { resolveInstancePaths, type AppPaths } from '../utils/paths';
import type { RuntimeAdapter } from '../adapters/base';
import { LocalDockerAdapter } from '../adapters/local-docker';
import { SshDockerAdapter } from '../adapters/ssh-docker';

export class ProjectService {
  constructor(
    private readonly repository: ProjectRepository,
    private readonly eventBus: EventBus,
    private readonly paths: AppPaths,
  ) {}

  async listProjects() {
    return this.repository.listProjects();
  }

  async createProject(input: ProjectCreateInput) {
    const parsed = ProjectCreateSchema.parse({
      ...input,
      clusterConfig: input.clusterConfig ?? createDefaultClusterConfig(input.name),
      target: normalizeTarget(input.target, input.slug),
    });

    const projectId = await this.repository.createProject(parsed);
    await this.prepareProjectFiles(projectId);
    return this.getProject(projectId);
  }

  async getProject(projectId: string): Promise<ProjectDetail> {
    const detail = await this.repository.getProjectDetail(projectId);
    const ports = getProjectPorts(detail.clusterConfig);
    const [runtime, network] = await Promise.all([
      this.getRuntime(detail.target, detail.slug, detail.deployment?.composePath ?? null),
      this.createAdapter(detail.target).inspectNetwork(detail.target, ports),
    ]);

    return {
      ...detail,
      network,
      runtime,
    };
  }

  async updateProject(projectId: string, input: ProjectConfigUpdateInput) {
    const parsed = ProjectConfigUpdateSchema.parse({
      ...input,
      target: normalizeTarget(input.target, (await this.repository.getProjectDetail(projectId)).slug),
      clusterConfig: ClusterConfigSchema.parse(input.clusterConfig),
    });

    await this.repository.updateProject(projectId, parsed);
    await this.prepareProjectFiles(projectId);
    return this.getProject(projectId);
  }

  async testTarget(target: TargetConfig) {
    const adapter = this.createAdapter(target);
    return adapter.testConnection();
  }

  async runAction(projectId: string, action: ProjectAction) {
    const project = await this.repository.getProjectDetail(projectId);
    const adapter = this.createAdapter(project.target);
    const task = await this.repository.createTask(projectId, action, `开始执行 ${action}`);
    this.eventBus.publishTask({
      type: 'task.started',
      projectId,
      taskId: task.id,
      action,
      message: `开始执行 ${action}`,
      timestamp: new Date().toISOString(),
    });

    try {
      const paths = resolveInstancePaths(this.paths.instancesDir, project.slug);
      const ports = getProjectPorts(project.clusterConfig);
      let message = '';
      let networkMessage = '';

      switch (action) {
        case 'deploy': {
          if (project.target.type === 'ssh') {
            networkMessage = await adapter.ensureFirewall(project.target, ports, project.slug);
          }
          await this.prepareProjectFiles(projectId);
          await this.syncIfNeeded(project.target, paths.root, adapter);
          await this.repository.touchDeployment(projectId);
          message = joinMessages(
            networkMessage,
            project.target.type === 'ssh'
              ? `部署文件已同步到 ${project.target.remotePath}`
              : `部署文件已生成到 ${paths.root}`,
          );
          break;
        }
        case 'start': {
          if (project.target.type === 'ssh') {
            networkMessage = await adapter.ensureFirewall(project.target, ports, project.slug);
          }
          await this.prepareProjectFiles(projectId);
          await this.syncIfNeeded(project.target, paths.root, adapter);
          message = joinMessages(networkMessage, await adapter.composeUp(paths.composeFile, project.slug));
          await this.repository.setProjectStatus(projectId, 'running');
          break;
        }
        case 'stop': {
          message = await adapter.composeStop(paths.composeFile, project.slug);
          await this.repository.setProjectStatus(projectId, 'stopped');
          break;
        }
        case 'restart': {
          message = await adapter.composeRestart(paths.composeFile, project.slug);
          await this.repository.setProjectStatus(projectId, 'running');
          break;
        }
        case 'update': {
          await this.prepareProjectFiles(projectId);
          await this.syncIfNeeded(project.target, paths.root, adapter);
          message = await adapter.composeUpdate(paths.composeFile, project.slug);
          await this.repository.setProjectStatus(projectId, 'running');
          break;
        }
        case 'backup': {
          message = await this.backupProject(projectId);
          break;
        }
        case 'check-ports': {
          const check = await adapter.checkPorts(project.target, ports);
          message = `${check.message}\n${check.detail}`.trim();
          break;
        }
        case 'ensure-firewall': {
          message = await adapter.ensureFirewall(project.target, ports, project.slug);
          break;
        }
      }

      await this.repository.updateTask(task.id, 'success', message);
      this.eventBus.publishTask({
        type: 'task.finished',
        projectId,
        taskId: task.id,
        action,
        message,
        timestamp: new Date().toISOString(),
      });
      this.eventBus.publishTask({
        type: 'status.changed',
        projectId,
        status: (await this.repository.getProjectDetail(projectId)).status,
        timestamp: new Date().toISOString(),
      });
      this.eventBus.publishLog({
        type: 'log.line',
        projectId,
        line: message,
        stream: 'system',
        timestamp: new Date().toISOString(),
      });
      return { ok: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : '未知错误';
      await this.repository.updateTask(task.id, 'failed', message);
      await this.repository.setProjectStatus(projectId, 'error');
      this.eventBus.publishTask({
        type: 'task.failed',
        projectId,
        taskId: task.id,
        action,
        message,
        timestamp: new Date().toISOString(),
      });
      this.eventBus.publishTask({
        type: 'status.changed',
        projectId,
        status: 'error',
        timestamp: new Date().toISOString(),
      });
      throw error;
    }
  }

  async streamLogs(projectId: string, onLine: (line: string, stream: 'stdout' | 'stderr' | 'system') => void) {
    const project = await this.repository.getProjectDetail(projectId);
    const adapter = this.createAdapter(project.target);
    const paths = resolveInstancePaths(this.paths.instancesDir, project.slug);

    return adapter.streamComposeLogs(paths.composeFile, project.slug, {
      onStdout: (line) => onLine(line, 'stdout'),
      onStderr: (line) => onLine(line, 'stderr'),
    });
  }

  private async prepareProjectFiles(projectId: string) {
    const detail = await this.repository.getProjectDetail(projectId);
    const paths = resolveInstancePaths(this.paths.instancesDir, detail.slug);
    await fs.mkdir(paths.configDir, { recursive: true });
    await fs.mkdir(path.join(paths.clusterDir, 'Master'), { recursive: true });
    await fs.mkdir(path.join(paths.clusterDir, 'Caves'), { recursive: true });
    await fs.mkdir(paths.serverDir, { recursive: true });
    await fs.mkdir(paths.backupsDir, { recursive: true });
    await fs.mkdir(paths.composeDir, { recursive: true });

    const preview = renderConfigPreview(detail.clusterConfig);
    await writeRenderedFiles(paths.configDir, preview);
    await writeClusterRuntimeFiles(paths.clusterDir, preview);

    const compose = renderComposeFile({
      slug: detail.slug,
      clusterConfig: detail.clusterConfig,
    });
    await fs.writeFile(paths.composeFile, compose, 'utf8');
    await this.repository.upsertDeployment(
      projectId,
      paths.composeFile,
      detail.target.type === 'ssh' ? detail.target.remotePath : paths.root,
      false,
    );
  }

  private createAdapter(target: TargetConfig): RuntimeAdapter {
    if (target.type === 'local') {
      return new LocalDockerAdapter(target);
    }
    return new SshDockerAdapter(target);
  }

  private async getRuntime(target: TargetConfig, slug: string, composeFile: string | null) {
    const adapter = this.createAdapter(target);
    const dockerCheck = await adapter.testConnection();
    if (!composeFile) {
      return {
        dockerAvailable: dockerCheck.ok,
        containers: [],
      };
    }

    try {
      const containers = await adapter.composePs(composeFile, slug);
      return {
        dockerAvailable: dockerCheck.ok,
        containers,
      };
    } catch {
      return {
        dockerAvailable: dockerCheck.ok,
        containers: [],
      };
    }
  }

  private async syncIfNeeded(target: TargetConfig, localRoot: string, adapter: RuntimeAdapter) {
    if (target.type === 'ssh' && adapter.syncInstance) {
      await adapter.syncInstance(localRoot, target);
    }
  }

  private async backupProject(projectId: string): Promise<string> {
    const detail = await this.repository.getProjectDetail(projectId);
    const paths = resolveInstancePaths(this.paths.instancesDir, detail.slug);
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `${detail.slug}-${timestamp}.tar.gz`;

    if (detail.target.type === 'ssh') {
      const backupDir = path.posix.join(detail.target.remotePath, 'backups');
      const remoteFile = path.posix.join(backupDir, filename);
      const adapter = this.createAdapter(detail.target);
      if (!adapter.createRemoteBackup) {
        throw new Error('当前远程适配器不支持备份');
      }
      await adapter.createRemoteBackup(detail.target.remotePath, remoteFile);
      await this.repository.addBackup(projectId, filename, remoteFile, 0);
      return `远程备份已创建：${remoteFile}`;
    }

    const backupFile = path.join(paths.backupsDir, filename);
    await fs.mkdir(paths.backupsDir, { recursive: true });
    await fs.cp(paths.dataDir, path.join(paths.backupsDir, `${detail.slug}-snapshot`), {
      recursive: true,
      force: true,
    });
    const { runCommand } = await import('../utils/command');
    const result = await runCommand('tar', ['-czf', backupFile, '-C', paths.root, 'data']);
    await fs.rm(path.join(paths.backupsDir, `${detail.slug}-snapshot`), { recursive: true, force: true });
    if (!result.ok) {
      throw new Error(result.stderr || '本地备份失败');
    }
    const sizeBytes = statSync(backupFile).size;
    await this.repository.addBackup(projectId, filename, backupFile, sizeBytes);
    await this.trimBackups(projectId, paths.backupsDir);
    return `本地备份已创建：${backupFile}`;
  }

  private async trimBackups(projectId: string, backupsDir: string) {
    const records = await this.repository.listBackups(projectId);
    for (const record of records.slice(10)) {
      try {
        await fs.rm(path.join(backupsDir, record.filename), { force: true });
      } catch {
        // 忽略磁盘删除失败，继续清理数据库记录
      }
      await this.repository.removeBackupRecord(record.id);
    }
  }
}

function joinMessages(...parts: Array<string | null | undefined>) {
  return parts
    .map((part) => part?.trim())
    .filter((part): part is string => !!part)
    .join('\n');
}

async function writeRenderedFiles(
  configDir: string,
  preview: Record<string, string>,
) {
  for (const [relativePath, content] of Object.entries(preview)) {
    const filePath = path.join(configDir, relativePath);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, content, 'utf8');
  }
}

async function writeClusterRuntimeFiles(
  clusterDir: string,
  preview: Record<string, string>,
) {
  const mappings: Record<string, string> = {
    'cluster.ini': path.join(clusterDir, 'cluster.ini'),
    'cluster_token.txt': path.join(clusterDir, 'cluster_token.txt'),
    'Master/server.ini': path.join(clusterDir, 'Master', 'server.ini'),
    'Caves/server.ini': path.join(clusterDir, 'Caves', 'server.ini'),
    'dedicated_server_mods_setup.lua': path.join(clusterDir, 'dedicated_server_mods_setup.lua'),
  };

  for (const [source, target] of Object.entries(mappings)) {
    const content = preview[source];
    if (typeof content !== 'string') {
      continue;
    }
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, content, 'utf8');
  }
}

function normalizeTarget(target: TargetConfig, slug: string): TargetConfig {
  const parsed = TargetConfigSchema.parse(target);
  if (parsed.type === 'ssh') {
    return {
      ...parsed,
      remotePath: parsed.remotePath?.trim() || createRemoteDeployPath(slug),
    };
  }
  return parsed;
}

function getProjectPorts(config: ClusterConfig) {
  return [
    config.master.serverPort,
    config.master.masterServerPort,
    config.master.authenticationPort,
    config.caves.serverPort,
    config.caves.masterServerPort,
    config.caves.authenticationPort,
  ];
}

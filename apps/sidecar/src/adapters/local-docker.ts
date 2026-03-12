import { setTimeout as delay } from 'node:timers/promises';
import { runStreamingCommand, streamCommand, runCommand } from '../utils/command';
import { parseComposePsOutput } from './compose-ps';
import type { RuntimeAdapter, RuntimeContainerInfo, PortCheckResult } from './base';
import type { LocalTargetConfig, ProjectNetwork, TargetConfig, TargetTestResponse } from '@dst-launcher/shared';
import { createLocalNetworkStatus } from './firewall';

export class LocalDockerAdapter implements RuntimeAdapter {
  constructor(private readonly config: LocalTargetConfig) {}

  private dockerArgs(...args: string[]) {
    return ['--context', this.config.dockerContext, ...args];
  }

  async testConnection(): Promise<TargetTestResponse> {
    const result = await runCommand('docker', this.dockerArgs('version', '--format', 'Docker {{.Server.Version}}'));
    return {
      ok: result.ok,
      message: result.ok ? '本地 Docker 可用' : '本地 Docker 不可用',
      detail: result.ok ? result.stdout.trim() : (result.stderr || result.stdout).trim(),
    };
  }

  async composeUp(composeFile: string, slug: string): Promise<string> {
    const result = await runCommand('docker', this.dockerArgs('compose', '-f', composeFile, '-p', slug, 'up', '-d', '--remove-orphans'));
    if (!result.ok) throw new Error(result.stderr || '启动容器失败');
    return result.stdout.trim() || '容器已启动';
  }

  async composeStop(composeFile: string, slug: string): Promise<string> {
    const result = await runCommand('docker', this.dockerArgs('compose', '-f', composeFile, '-p', slug, 'stop'));
    if (!result.ok) throw new Error(result.stderr || '停止容器失败');
    return result.stdout.trim() || '容器已停止';
  }

  async composeRestart(composeFile: string, slug: string): Promise<string> {
    const result = await runCommand('docker', this.dockerArgs('compose', '-f', composeFile, '-p', slug, 'restart'));
    if (!result.ok) throw new Error(result.stderr || '重启容器失败');
    return result.stdout.trim() || '容器已重启';
  }

  async composeUpdate(composeFile: string, slug: string): Promise<string> {
    const pull = await runCommand('docker', this.dockerArgs('compose', '-f', composeFile, '-p', slug, 'pull'));
    if (!pull.ok) throw new Error(pull.stderr || '拉取镜像失败');
    const up = await runCommand('docker', this.dockerArgs('compose', '-f', composeFile, '-p', slug, 'up', '-d', '--force-recreate'));
    if (!up.ok) throw new Error(up.stderr || '更新容器失败');
    return `${pull.stdout}\n${up.stdout}`.trim();
  }

  async composePs(composeFile: string, slug: string): Promise<RuntimeContainerInfo[]> {
    const result = await runCommand('docker', this.dockerArgs('compose', '-f', composeFile, '-p', slug, 'ps', '--format', 'json'));
    if (!result.ok || !result.stdout.trim()) {
      return [];
    }
    return parseComposePsOutput(result.stdout);
  }

  streamComposeLogs(composeFile: string, slug: string, callbacks: Parameters<RuntimeAdapter['streamComposeLogs']>[2]) {
    return streamCommand(
      'docker',
      this.dockerArgs('compose', '-f', composeFile, '-p', slug, 'logs', '--follow', '--tail', '100'),
      {},
      callbacks,
    );
  }


  async inspectNetwork(_target: TargetConfig, ports: number[]): Promise<ProjectNetwork> {
    return createLocalNetworkStatus(ports);
  }

  async ensureFirewall(_target: TargetConfig, _ports: number[], _slug: string): Promise<string> {
    return '本地模式无需额外开放 UDP 防火墙规则。';
  }

  async prefetchMods(
    composeFile: string,
    slug: string,
    callbacks: {
      onStdout?: (line: string) => void;
      onStderr?: (line: string) => void;
    },
  ): Promise<string> {
    const up = await runCommand('docker', this.dockerArgs('compose', '-f', composeFile, '-p', slug, 'up', '-d', 'dst-master'));
    if (!up.ok) {
      throw new Error(up.stderr || '预拉取模组时启动维护容器失败');
    }

    await delay(Number(process.env.DST_PREFETCH_WAIT_MS || '15000'));
    const logs = await runStreamingCommand(
      'docker',
      this.dockerArgs('compose', '-f', composeFile, '-p', slug, 'logs', '--tail', '120', 'dst-master'),
      {},
      callbacks,
    );
    const stop = await runCommand('docker', this.dockerArgs('compose', '-f', composeFile, '-p', slug, 'stop', 'dst-master'));
    if (!stop.ok) {
      throw new Error(stop.stderr || '预拉取完成后停止维护容器失败');
    }

    if (!logs.ok && logs.stderr.trim()) {
      throw new Error(logs.stderr.trim());
    }

    return `${up.stdout}\n${logs.stdout}\n${stop.stdout}`.trim() || '模组预拉取任务完成';
  }

  async checkPorts(_target: TargetConfig, ports: number[]): Promise<PortCheckResult> {
    const checks = await Promise.all(
      ports.map(async (port) => {
        const result = await runCommand('bash', ['-lc', `lsof -n -P -iUDP:${port}`]);
        return {
          port,
          inUse: result.ok && !!result.stdout.trim(),
          detail: (result.stdout || result.stderr).trim(),
        };
      }),
    );

    const busy = checks.filter((item) => item.inUse);
    return {
      ok: busy.length === 0,
      message: busy.length === 0 ? '端口检查通过' : '发现端口冲突',
      detail: checks
        .map((item) => `${item.port}: ${item.inUse ? '占用' : '空闲'}${item.detail ? ` (${item.detail.split('\n')[0]})` : ''}`)
        .join('\n'),
    };
  }
}

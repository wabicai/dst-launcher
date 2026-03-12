import path from 'node:path';
import { streamCommand, runCommand } from '../utils/command';
import { parseComposePsOutput } from './compose-ps';
import type { RuntimeAdapter, RuntimeContainerInfo, PortCheckResult } from './base';
import {
  createUfwNetworkStatus,
  createUnknownNetworkStatus,
  createUnsupportedNetworkStatus,
  normalizeUdpPorts,
} from './firewall';
import type { ProjectNetwork, SshTargetConfig, TargetConfig, TargetTestResponse } from '@dst-launcher/shared';

export class SshDockerAdapter implements RuntimeAdapter {
  constructor(private readonly config: SshTargetConfig) {}

  private remote(): string {
    return `${this.config.username}@${this.config.host}`;
  }

  private sshArgs(command: string): string[] {
    return [
      '-i',
      this.config.privateKeyPath,
      '-p',
      String(this.config.port),
      '-o',
      'BatchMode=yes',
      this.remote(),
      command,
    ];
  }

  async testConnection(): Promise<TargetTestResponse> {
    const result = await runCommand(
      'ssh',
      this.sshArgs('docker --version && docker compose version'),
    );
    return {
      ok: result.ok,
      message: result.ok ? '远程 Docker 可用' : '远程 Docker 不可用',
      detail: (result.stdout || result.stderr).trim(),
    };
  }

  async syncInstance(localRoot: string, remoteConfig: SshTargetConfig): Promise<void> {
    const remotePath = remoteConfig.remotePath;
    await runCommand('ssh', this.sshArgs(`mkdir -p ${shellPath(remotePath)}`));
    const result = await runCommand('rsync', [
      '-az',
      '--delete',
      '-e',
      `ssh -i ${remoteConfig.privateKeyPath} -p ${remoteConfig.port}`,
      `${path.resolve(localRoot)}/`,
      `${remoteConfig.username}@${remoteConfig.host}:${remotePath}/`,
    ]);
    if (!result.ok) {
      throw new Error(result.stderr || '同步远程实例目录失败');
    }

    const preparePermissions = await runCommand('ssh', this.sshArgs([
      `mkdir -p ${shellPath(path.posix.join(remotePath, 'data'))}`,
      `mkdir -p ${shellPath(path.posix.join(remotePath, 'backups'))}`,
      `chmod -R 0777 ${shellPath(path.posix.join(remotePath, 'data'))}`,
      `chmod -R 0777 ${shellPath(path.posix.join(remotePath, 'backups'))}`,
    ].join(' && ')));
    if (!preparePermissions.ok) {
      throw new Error(preparePermissions.stderr || '远程目录权限初始化失败');
    }
  }

  async composeUp(composeFile: string, slug: string): Promise<string> {
    return this.runCompose(composeFile, slug, 'up -d --remove-orphans');
  }

  async composeStop(composeFile: string, slug: string): Promise<string> {
    return this.runCompose(composeFile, slug, 'stop');
  }

  async composeRestart(composeFile: string, slug: string): Promise<string> {
    return this.runCompose(composeFile, slug, 'restart');
  }

  async composeUpdate(composeFile: string, slug: string): Promise<string> {
    const relativeFile = path.basename(composeFile);
    const command = [
      `cd ${shellPath(path.dirname(this.resolveRemoteComposePath(composeFile)))}`,
      `docker compose -f ${shellEscape(relativeFile)} -p ${shellEscape(slug)} pull`,
      `docker compose -f ${shellEscape(relativeFile)} -p ${shellEscape(slug)} up -d --force-recreate`,
    ].join(' && ');
    const result = await runCommand('ssh', this.sshArgs(command));
    if (!result.ok) {
      throw new Error(result.stderr || '远程更新失败');
    }
    return result.stdout.trim() || '远程容器已更新';
  }

  async composePs(composeFile: string, slug: string): Promise<RuntimeContainerInfo[]> {
    const command = this.composeShell(composeFile, slug, 'ps --format json');
    const result = await runCommand('ssh', this.sshArgs(command));
    if (!result.ok || !result.stdout.trim()) return [];
    return parseComposePsOutput(result.stdout);
  }

  streamComposeLogs(composeFile: string, slug: string, callbacks: Parameters<RuntimeAdapter['streamComposeLogs']>[2]) {
    const command = this.composeShell(composeFile, slug, 'logs --follow --tail 100');
    return streamCommand('ssh', this.sshArgs(command), {}, callbacks);
  }

  async inspectNetwork(_target: TargetConfig, ports: number[]): Promise<ProjectNetwork> {
    const requiredUdpPorts = normalizeUdpPorts(ports);
    const detectResult = await runCommand('ssh', this.sshArgs('if command -v ufw >/dev/null 2>&1; then echo installed; else echo missing; fi'));
    if (!detectResult.ok) {
      return createUnknownNetworkStatus(requiredUdpPorts, (detectResult.stderr || detectResult.stdout || '远程防火墙检测失败').trim());
    }

    if (!/installed/i.test(detectResult.stdout)) {
      return createUnsupportedNetworkStatus(requiredUdpPorts, '远端未检测到 UFW；DST Launcher 当前不会自动修改其他防火墙或云安全组，请手动放通这些 UDP 端口。');
    }

    const statusResult = await runCommand('ssh', this.sshArgs('ufw status'));
    if (!statusResult.ok) {
      return createUnknownNetworkStatus(requiredUdpPorts, (statusResult.stderr || statusResult.stdout || '读取 UFW 状态失败').trim());
    }

    return createUfwNetworkStatus(requiredUdpPorts, statusResult.stdout);
  }

  async ensureFirewall(target: TargetConfig, ports: number[], slug: string): Promise<string> {
    const network = await this.inspectNetwork(target, ports);

    if (!network.firewallSupported) {
      return network.detail;
    }

    if (network.firewallProvider !== 'ufw') {
      return network.detail || '当前目标没有可自动处理的防火墙提供方。';
    }

    if (network.missingUdpPorts.length === 0) {
      return network.detail;
    }

    const allowCommand = network.missingUdpPorts
      .map((port) => `ufw allow ${port}/udp comment ${shellEscape(`DST Launcher ${slug}`)}`)
      .join(' && ');
    const allowResult = await runCommand('ssh', this.sshArgs(allowCommand));
    if (!allowResult.ok) {
      throw new Error(allowResult.stderr || allowResult.stdout || '自动放通 UFW 端口失败');
    }

    const refreshed = await this.inspectNetwork(target, ports);
    if (refreshed.missingUdpPorts.length > 0) {
      throw new Error(`UFW 规则写入后仍缺少 UDP 端口：${refreshed.missingUdpPorts.join(', ')}`);
    }

    return `已自动放通 UDP 端口：${network.missingUdpPorts.join(', ')}`;
  }

  async checkPorts(_target: TargetConfig, ports: number[]): Promise<PortCheckResult> {
    const script = ports
      .map((port) => `if ss -lun | grep -q ":${port} "; then echo used:${port}; else echo free:${port}; fi`)
      .join('; ');
    const result = await runCommand('ssh', this.sshArgs(script));
    if (!result.ok) {
      return {
        ok: false,
        message: '远程端口检查失败',
        detail: result.stderr || result.stdout,
      };
    }

    const busy = result.stdout
      .split(/\r?\n/)
      .filter(Boolean)
      .filter((line) => line.startsWith('used:'));
    return {
      ok: busy.length === 0,
      message: busy.length === 0 ? '远程端口检查通过' : '远程端口存在占用',
      detail: result.stdout.trim(),
    };
  }

  async createRemoteBackup(remotePath: string, backupFile: string): Promise<void> {
    const backupDir = path.dirname(backupFile);
    const backupName = path.basename(backupFile);
    const command = [
      `mkdir -p ${shellPath(backupDir)}`,
      `cd ${shellPath(remotePath)}`,
      `tar -czf ${shellPath(path.join(backupDir, backupName))} data`,
    ].join(' && ');
    const result = await runCommand('ssh', this.sshArgs(command));
    if (!result.ok) {
      throw new Error(result.stderr || '远程备份失败');
    }
  }

  private async runCompose(composeFile: string, slug: string, args: string) {
    const result = await runCommand('ssh', this.sshArgs(this.composeShell(composeFile, slug, args)));
    if (!result.ok) {
      throw new Error(result.stderr || '远程 Docker Compose 命令失败');
    }
    return result.stdout.trim() || '远程命令执行成功';
  }

  private composeShell(composeFile: string, slug: string, args: string) {
    const remoteComposeFile = this.resolveRemoteComposePath(composeFile);
    const remoteComposeDir = path.posix.dirname(remoteComposeFile);
    const relativeFile = path.posix.basename(remoteComposeFile);
    return `cd ${shellPath(remoteComposeDir)} && docker compose -f ${shellEscape(relativeFile)} -p ${shellEscape(slug)} ${args}`;
  }

  private resolveRemoteComposePath(composeFile: string) {
    return path.posix.join(this.config.remotePath, 'compose', path.basename(composeFile));
  }
}

function shellEscape(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

function shellPath(value: string): string {
  if (value === '~') {
    return '$HOME';
  }

  if (value.startsWith('~/')) {
    return `"$HOME/${escapeDoubleQuoted(value.slice(2))}"`;
  }

  return shellEscape(value);
}

function escapeDoubleQuoted(value: string): string {
  return value.replace(/[\\"$`]/g, '\\$&');
}

import path from 'node:path';
import { streamCommand, runCommand, runStreamingCommand } from '../utils/command';
import { parseComposePsOutput } from './compose-ps';
import type { RuntimeAdapter, RuntimeContainerInfo, PortCheckResult, StreamingCallbacks } from './base';
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

  async syncInstance(localRoot: string, remoteConfig: SshTargetConfig, callbacks?: StreamingCallbacks): Promise<void> {
    const remotePath = remoteConfig.remotePath;
    await runCommand('ssh', this.sshArgs(`mkdir -p ${shellPath(remotePath)}`));
    callbacks?.onStdout?.(`rsync → ${remoteConfig.host}:${remotePath}`);
    const result = await runStreamingCommand('rsync', [
      '-az',
      '--delete',
      '-e',
      `ssh -i ${shellEscape(remoteConfig.privateKeyPath)} -p ${String(remoteConfig.port)}`,
      `${path.resolve(localRoot)}/`,
      `${remoteConfig.username}@${remoteConfig.host}:${remotePath}/`,
    ], {}, callbacks);
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

  async composeUp(composeFile: string, slug: string, callbacks?: StreamingCallbacks): Promise<string> {
    return this.runCompose(composeFile, slug, 'up -d --remove-orphans', callbacks);
  }

  async composeStop(composeFile: string, slug: string, callbacks?: StreamingCallbacks): Promise<string> {
    return this.runCompose(composeFile, slug, 'stop', callbacks);
  }

  async composeRestart(composeFile: string, slug: string, callbacks?: StreamingCallbacks): Promise<string> {
    return this.runCompose(composeFile, slug, 'restart', callbacks);
  }

  async composeUpdate(composeFile: string, slug: string, callbacks?: StreamingCallbacks): Promise<string> {
    const relativeFile = path.basename(composeFile);
    const pullCmd = [
      `cd ${shellPath(path.dirname(this.resolveRemoteComposePath(composeFile)))}`,
      `docker compose -f ${shellEscape(relativeFile)} -p ${shellEscape(slug)} pull`,
    ].join(' && ');
    const pull = await runStreamingCommand('ssh', this.sshArgs(pullCmd), {}, callbacks);
    if (!pull.ok) {
      throw new Error(pull.stderr || '远程拉取镜像失败');
    }
    const upCmd = [
      `cd ${shellPath(path.dirname(this.resolveRemoteComposePath(composeFile)))}`,
      `docker compose -f ${shellEscape(relativeFile)} -p ${shellEscape(slug)} up -d --force-recreate`,
    ].join(' && ');
    const up = await runStreamingCommand('ssh', this.sshArgs(upCmd), {}, callbacks);
    if (!up.ok) {
      throw new Error(up.stderr || '远程更新失败');
    }
    return `${pull.stdout}\n${up.stdout}`.trim() || '远程容器已更新';
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
      .map((port) => {
        assertPort(port);
        return `ufw allow ${port}/udp comment ${shellEscape(`DST Launcher ${slug}`)}`;
      })
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
      .map((port) => {
        assertPort(port);
        return `if ss -lun | grep -q ':${port} '; then echo used:${port}; else echo free:${port}; fi`;
      })
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

  private async runCompose(composeFile: string, slug: string, args: string, callbacks?: StreamingCallbacks) {
    const result = await runStreamingCommand('ssh', this.sshArgs(this.composeShell(composeFile, slug, args)), {}, callbacks);
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

  async prefetchMods(
    composeFile: string,
    slug: string,
    callbacks: {
      onStdout?: (line: string) => void;
      onStderr?: (line: string) => void;
    },
  ): Promise<string> {
    const remoteComposeFile = this.resolveRemoteComposePath(composeFile);
    const remoteComposeDir = path.posix.dirname(remoteComposeFile);
    const relativeFile = path.posix.basename(remoteComposeFile);
    const maxWaitSeconds = Math.max(10, Math.floor(Number(process.env.DST_PREFETCH_MAX_WAIT_MS || '120000') / 1000));
    const idleSeconds = Math.max(5, Math.floor(Number(process.env.DST_PREFETCH_IDLE_MS || '10000') / 1000));

    // Stop all containers first, then start only master for mod download.
    // Use a log-monitoring script that exits on completion signals or idle timeout.
    const command = [
      `cd ${shellPath(remoteComposeDir)}`,
      `docker compose -f ${shellEscape(relativeFile)} -p ${shellEscape(slug)} stop`,
      `docker compose -f ${shellEscape(relativeFile)} -p ${shellEscape(slug)} up -d dst_master`,
      // Monitor logs: exit when mods are done or after idle timeout
      `timeout ${maxWaitSeconds} sh -c 'docker compose -f ${shellEscape(relativeFile)} -p ${shellEscape(slug)} logs --follow dst_master 2>&1 | while IFS= read -r line; do echo "$line"; case "$line" in *"DownloadMods(0)"*|*"There are 0 mods to download"*|*"Sim paused"*) kill \\$\\$ 2>/dev/null; break;; esac; done' || true`,
      `docker compose -f ${shellEscape(relativeFile)} -p ${shellEscape(slug)} stop`,
    ].join(' && ');

    const result = await runStreamingCommand('ssh', this.sshArgs(command), {}, callbacks);
    if (!result.ok) {
      throw new Error(result.stderr || result.stdout || '远程模组预拉取失败');
    }

    return result.stdout.trim() || '远程模组预拉取任务完成';
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

function assertPort(port: number) {
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`无效端口号: ${port}`);
  }
}

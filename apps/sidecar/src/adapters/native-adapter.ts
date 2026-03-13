import fs from 'node:fs/promises';
import path from 'node:path';
import { existsSync } from 'node:fs';
import { setTimeout as delay } from 'node:timers/promises';
import { runCommand, runStreamingCommand, streamCommand } from '../utils/command';
import { nativeProcessManager } from './native-process-manager';
import { createLocalNetworkStatus } from './firewall';
import type { RuntimeAdapter, RuntimeContainerInfo, PortCheckResult } from './base';
import type { NativeTargetConfig, ProjectNetwork, TargetConfig, TargetTestResponse } from '@dst-launcher/shared';

const STEAMCMD_URL = 'https://steamcdn-a.akamaihd.net/client/installer/steamcmd_osx.tar.gz';
const DST_APP_ID = '343050';

export class NativeAdapter implements RuntimeAdapter {
  constructor(
    private readonly config: NativeTargetConfig,
    private readonly instancePaths: {
      root: string;
      steamcmdDir: string;
      nativeServerDir: string;
      nativeBinary: string;
      clusterDir: string;
      dataDir: string;
    },
  ) {}

  async testConnection(): Promise<TargetTestResponse> {
    if (existsSync(this.instancePaths.nativeBinary)) {
      return { ok: true, message: 'DST 服务端二进制已就绪', detail: this.instancePaths.nativeBinary };
    }
    return { ok: false, message: 'DST 服务端未安装', detail: '请先执行「安装/更新服务器」' };
  }

  async installServer(callbacks?: {
    onStdout?: (line: string) => void;
    onStderr?: (line: string) => void;
  }): Promise<string> {
    const steamcmdDir = this.config.steamcmdPath || this.instancePaths.steamcmdDir;
    const installPath = this.config.installPath || this.instancePaths.nativeServerDir;
    const steamcmdBin = path.join(steamcmdDir, 'steamcmd.sh');

    // Download SteamCMD if not present
    if (!existsSync(steamcmdBin)) {
      await fs.mkdir(steamcmdDir, { recursive: true });
      const tarball = path.join(steamcmdDir, 'steamcmd_osx.tar.gz');
      const curl = await runCommand('curl', ['-L', '-o', tarball, STEAMCMD_URL]);
      if (!curl.ok) throw new Error(`下载 SteamCMD 失败: ${curl.stderr}`);
      const extract = await runCommand('tar', ['-xzf', tarball, '-C', steamcmdDir]);
      if (!extract.ok) throw new Error(`解压 SteamCMD 失败: ${extract.stderr}`);
      await fs.rm(tarball, { force: true });
      callbacks?.onStdout?.('SteamCMD 已下载并解压');
    }

    // Run SteamCMD to install/update DST server
    await fs.mkdir(installPath, { recursive: true });
    const result = await runStreamingCommand(
      steamcmdBin,
      [
        '+force_install_dir', installPath,
        '+login', 'anonymous',
        '+app_update', DST_APP_ID, 'validate',
        '+quit',
      ],
      {},
      callbacks ?? {},
    );
    if (!result.ok) throw new Error(`SteamCMD 安装失败: ${result.stderr}`);

    // Symlink steamclient.dylib
    const dylib = path.join(steamcmdDir, 'osx32', 'steamclient.dylib');
    const binaryDir = path.dirname(this.instancePaths.nativeBinary);
    if (existsSync(dylib) && existsSync(binaryDir)) {
      const target = path.join(binaryDir, 'steamclient.dylib');
      await fs.rm(target, { force: true });
      await fs.symlink(dylib, target);
    }

    return '服务器安装/更新完成';
  }

  async composeUp(_composeFile: string, slug: string): Promise<string> {
    if (!existsSync(this.instancePaths.nativeBinary)) {
      throw new Error('DST 服务端未安装，请先执行「安装/更新服务器」');
    }

    // Write worldgenoverride.lua for Caves if not present
    const cavesWorldgen = path.join(this.instancePaths.clusterDir, 'Caves', 'worldgenoverride.lua');
    if (!existsSync(cavesWorldgen)) {
      await fs.mkdir(path.dirname(cavesWorldgen), { recursive: true });
      await fs.writeFile(cavesWorldgen, 'return { override_enabled = true, preset = "DST_CAVE" }\n', 'utf8');
    }

    const dataDir = this.instancePaths.dataDir;
    const binary = this.instancePaths.nativeBinary;

    // Start Master
    const masterProc = streamCommand(
      binary,
      ['-persistent_storage_root', dataDir, '-conf_dir', 'cluster', '-cluster', '.', '-shard', 'Master'],
      {},
    );
    nativeProcessManager.register(slug, 'master', masterProc);

    // Start Caves
    const cavesProc = streamCommand(
      binary,
      ['-persistent_storage_root', dataDir, '-conf_dir', 'cluster', '-cluster', '.', '-shard', 'Caves'],
      {},
    );
    nativeProcessManager.register(slug, 'caves', cavesProc);

    return 'Master + Caves 进程已启动';
  }

  async composeStop(_composeFile: string, slug: string): Promise<string> {
    await nativeProcessManager.killAll(slug);
    return '服务器进程已停止';
  }

  async composeRestart(composeFile: string, slug: string): Promise<string> {
    await this.composeStop(composeFile, slug);
    await delay(1000);
    return await this.composeUp(composeFile, slug);
  }

  async composeUpdate(_composeFile: string, _slug: string): Promise<string> {
    return await this.installServer();
  }

  async composePs(_composeFile: string, slug: string): Promise<RuntimeContainerInfo[]> {
    const entry = nativeProcessManager.get(slug);
    if (!entry) return [];

    const containers: RuntimeContainerInfo[] = [];
    for (const shard of ['master', 'caves'] as const) {
      const running = nativeProcessManager.isRunning(slug, shard);
      containers.push({
        service: shard === 'master' ? 'dst_master' : 'dst_caves',
        state: running ? 'running' : 'exited',
        health: null,
      });
    }
    return containers;
  }

  streamComposeLogs(_composeFile: string, slug: string, callbacks: Parameters<RuntimeAdapter['streamComposeLogs']>[2]) {
    const entry = nativeProcessManager.get(slug);

    // Pipe from both master and caves processes
    const proxyLines = (proc: import('node:child_process').ChildProcess | undefined, label: string) => {
      if (!proc) return;
      let buffer = '';
      const onData = (chunk: Buffer) => {
        buffer += chunk.toString();
        const lines = buffer.split(/\r?\n/);
        buffer = lines.pop() ?? '';
        for (const line of lines) {
          if (line.trim()) callbacks.onStdout(`[${label}] ${line}`);
        }
      };
      const onErrData = (chunk: Buffer) => {
        callbacks.onStderr(`[${label}] ${chunk.toString().trim()}`);
      };
      proc.stdout?.on('data', onData);
      proc.stderr?.on('data', onErrData);

      // Detach listeners when the dummy watcher is killed (WebSocket close)
      return () => {
        proc.stdout?.off('data', onData);
        proc.stderr?.off('data', onErrData);
      };
    };

    const cleanups: Array<() => void> = [];
    const c1 = proxyLines(entry?.master, 'Master');
    const c2 = proxyLines(entry?.caves, 'Caves');
    if (c1) cleanups.push(c1);
    if (c2) cleanups.push(c2);

    // Return a dummy process that can be safely killed without affecting the game.
    // When register.ts calls child.kill() on WebSocket close, only this tail process dies.
    const dummy = streamCommand('tail', ['-f', '/dev/null'], {});
    dummy.on('close', () => {
      for (const cleanup of cleanups) cleanup();
    });
    return dummy;
  }

  async prefetchMods(_composeFile: string, slug: string, callbacks: {
    onStdout?: (line: string) => void;
    onStderr?: (line: string) => void;
  }): Promise<string> {
    if (!existsSync(this.instancePaths.nativeBinary)) {
      throw new Error('DST 服务端未安装，请先执行「安装/更新服务器」');
    }

    const dataDir = this.instancePaths.dataDir;
    const binary = this.instancePaths.nativeBinary;
    const waitMs = Number(process.env.DST_PREFETCH_WAIT_MS || '15000');

    // Start only Master for mod downloads, then kill after timeout
    const child = streamCommand(
      binary,
      ['-persistent_storage_root', dataDir, '-conf_dir', 'cluster', '-cluster', '.', '-shard', 'Master'],
      {},
      callbacks,
    );

    // Wait for mods to download
    await delay(Math.max(5000, waitMs));

    // Kill the server process
    if (child.exitCode === null && !child.killed) {
      child.kill('SIGTERM');
      await new Promise<void>((resolve) => {
        const timer = setTimeout(() => {
          if (child.exitCode === null && !child.killed) child.kill('SIGKILL');
          resolve();
        }, 5000);
        child.on('close', () => { clearTimeout(timer); resolve(); });
        if (child.exitCode !== null) { clearTimeout(timer); resolve(); }
      });
    }

    return '模组预拉取任务完成';
  }

  async checkPorts(_target: TargetConfig, ports: number[]): Promise<PortCheckResult> {
    const checks = await Promise.all(
      ports.map(async (port) => {
        assertPort(port);
        const result = await runCommand('lsof', ['-n', '-P', `-iUDP:${port}`]);
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

  async inspectNetwork(_target: TargetConfig, ports: number[]): Promise<ProjectNetwork> {
    return createLocalNetworkStatus(ports);
  }

  async ensureFirewall(_target: TargetConfig, _ports: number[], _slug: string): Promise<string> {
    return '本地模式无需额外开放 UDP 防火墙规则。';
  }
}

function assertPort(port: number) {
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`无效端口号: ${port}`);
  }
}

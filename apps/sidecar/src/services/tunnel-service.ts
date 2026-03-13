import fs from 'node:fs/promises';
import path from 'node:path';
import { existsSync } from 'node:fs';
import { runCommand, streamCommand } from '../utils/command';
import type { ChildProcess } from 'node:child_process';
import type { TunnelInfo } from '@dst-launcher/shared';

export type TunnelStatus = {
  active: boolean;
  info?: TunnelInfo;
  claimUrl?: string;
  error?: string;
};

// playit.gg stdout patterns (with -s flag for log-only mode):
//   Claim:   "Visit link to setup https://playit.gg/claim/abc123def0"
//   Status:  "playit (v0.17.1): 1710000000000 tunnel running, 1 tunnels registered"
//   Tunnel:  "180.ip.ply.gg:17019 => 127.0.0.1:10998"
//   Login:   "login: https://playit.gg/login/guest-account/..."
//   No tuns: "Add tunnels here: https://playit.gg/account/agents/..."

const CLAIM_URL_RE = /https:\/\/playit\.gg\/claim\/[0-9a-f]+/;
const TUNNEL_LINE_RE = /^(\S+):(\d+)\s+=>\s+(\S+):(\d+)$/;
const TUNNEL_RUNNING_RE = /tunnel running, (\d+) tunnels? registered/;
const ADD_TUNNELS_RE = /Add tunnels here: (https:\/\/playit\.gg\/account\/agents\/\S+)/;

class PlayitProvider {
  private process: ChildProcess | null = null;
  private currentStatus: TunnelStatus = { active: false };
  private binaryPath = '';
  private secretPath = '';

  async install(targetDir: string): Promise<void> {
    await fs.mkdir(targetDir, { recursive: true });
    this.binaryPath = path.join(targetDir, 'playit');
    this.secretPath = path.join(targetDir, 'playit.toml');

    if (existsSync(this.binaryPath)) return;

    const platform = process.platform;
    const arch = process.arch;

    if (platform === 'darwin') {
      // macOS: GitHub releases don't have macOS binaries, use Homebrew
      const brewCheck = await runCommand('which', ['brew']);
      if (!brewCheck.ok) {
        throw new Error(
          'macOS 上需要通过 Homebrew 安装 playit。请先安装 Homebrew (https://brew.sh)，然后重试。',
        );
      }
      const brewInstall = await runCommand('brew', ['install', 'playit']);
      if (!brewInstall.ok) {
        throw new Error(`通过 Homebrew 安装 playit 失败: ${brewInstall.stderr}`);
      }
      // Find the installed binary and symlink it
      const whichResult = await runCommand('which', ['playit']);
      if (!whichResult.ok || !whichResult.stdout.trim()) {
        throw new Error('Homebrew 安装完成但找不到 playit 二进制');
      }
      await fs.symlink(whichResult.stdout.trim(), this.binaryPath);
    } else if (platform === 'linux') {
      const url = arch === 'arm64'
        ? 'https://github.com/playit-cloud/playit-agent/releases/latest/download/playit-linux-aarch64'
        : 'https://github.com/playit-cloud/playit-agent/releases/latest/download/playit-linux-amd64';
      const result = await runCommand('curl', ['-fSL', '-o', this.binaryPath, url]);
      if (!result.ok) throw new Error(`下载 playit 失败: ${result.stderr}`);
      await fs.chmod(this.binaryPath, 0o755);
    } else {
      throw new Error(`不支持的平台: ${platform}`);
    }
  }

  async start(ports: number[], callbacks?: {
    onStdout?: (line: string) => void;
    onStderr?: (line: string) => void;
  }): Promise<void> {
    if (this.process) {
      await this.stop();
    }

    if (!this.binaryPath || !existsSync(this.binaryPath)) {
      throw new Error('playit 未安装，请先安装');
    }

    this.currentStatus = { active: false };

    // Use -s for stdout log mode (not TUI), --secret_path to isolate config
    const args = ['-s', '--secret_path', this.secretPath];

    this.process = streamCommand(this.binaryPath, args, {}, {
      onStdout: (line) => {
        callbacks?.onStdout?.(line);
        this.parseLine(line, ports);
      },
      onStderr: (line) => {
        callbacks?.onStderr?.(line);
      },
      onClose: () => {
        if (this.currentStatus.active) {
          this.currentStatus = { active: false };
        }
        this.process = null;
      },
    });
  }

  private parseLine(line: string, ports: number[]) {
    // Check for claim URL
    const claimMatch = line.match(CLAIM_URL_RE);
    if (claimMatch) {
      this.currentStatus = {
        ...this.currentStatus,
        active: false,
        claimUrl: claimMatch[0],
      };
      return;
    }

    // Check for tunnel running status
    const runningMatch = line.match(TUNNEL_RUNNING_RE);
    if (runningMatch) {
      const tunnelCount = Number(runningMatch[1]);
      if (tunnelCount > 0 && !this.currentStatus.claimUrl) {
        this.currentStatus = {
          ...this.currentStatus,
          active: true,
          claimUrl: undefined,
        };
      }
    }

    // Check for tunnel address line: "180.ip.ply.gg:17019 => 127.0.0.1:10998"
    const tunnelMatch = line.match(TUNNEL_LINE_RE);
    if (tunnelMatch) {
      const publicHost = tunnelMatch[1]!;
      const publicPort = Number(tunnelMatch[2]);
      const localPort = Number(tunnelMatch[4]);

      // Build/update port mappings
      const existing = this.currentStatus.info?.portMappings ?? [];
      const alreadyMapped = existing.some(
        (m) => m.localPort === localPort && m.publicPort === publicPort,
      );

      const portMappings = alreadyMapped
        ? existing
        : [...existing, { localPort, publicPort }];

      this.currentStatus = {
        active: true,
        claimUrl: undefined,
        info: {
          active: true,
          publicHost,
          portMappings,
          error: '',
        },
      };
      return;
    }

    // Check for "Add tunnels here" (no tunnels configured)
    const addMatch = line.match(ADD_TUNNELS_RE);
    if (addMatch) {
      this.currentStatus = {
        active: true,
        error: `没有配置隧道，请访问 ${addMatch[1]} 添加 UDP 隧道。端口: ${ports.join(', ')}`,
      };
    }
  }

  async stop(): Promise<void> {
    if (this.process && this.process.exitCode === null) {
      this.process.kill('SIGTERM');
      await new Promise<void>((resolve) => {
        const timer = setTimeout(() => {
          if (this.process && this.process.exitCode === null) {
            this.process.kill('SIGKILL');
          }
          resolve();
        }, 5000);
        this.process?.on('close', () => {
          clearTimeout(timer);
          resolve();
        });
      });
    }
    this.process = null;
    this.currentStatus = { active: false };
  }

  status(): TunnelStatus {
    return { ...this.currentStatus };
  }
}

export class TunnelService {
  private providers = new Map<string, PlayitProvider>();

  private getOrCreate(slug: string): PlayitProvider {
    let provider = this.providers.get(slug);
    if (!provider) {
      provider = new PlayitProvider();
      this.providers.set(slug, provider);
    }
    return provider;
  }

  async install(slug: string, targetDir: string): Promise<void> {
    const provider = this.getOrCreate(slug);
    await provider.install(targetDir);
  }

  async start(slug: string, targetDir: string, ports: number[], callbacks?: {
    onStdout?: (line: string) => void;
    onStderr?: (line: string) => void;
  }): Promise<void> {
    const provider = this.getOrCreate(slug);
    // Auto-install if needed
    await provider.install(targetDir);
    await provider.start(ports, callbacks);
  }

  async stop(slug: string): Promise<void> {
    const provider = this.getOrCreate(slug);
    await provider.stop();
  }

  status(slug: string): TunnelStatus {
    const provider = this.providers.get(slug);
    return provider?.status() ?? { active: false };
  }

  async stopAll(): Promise<void> {
    for (const [, provider] of this.providers) {
      await provider.stop();
    }
  }
}

export const tunnelService = new TunnelService();

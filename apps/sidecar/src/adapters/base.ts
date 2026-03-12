import type { ChildProcess } from 'node:child_process';
import type { ProjectNetwork, SshTargetConfig, TargetConfig, TargetTestResponse } from '@dst-launcher/shared';

export interface RuntimeContainerInfo {
  service: string;
  state: string;
  health: string | null;
}

export interface PortCheckResult {
  ok: boolean;
  message: string;
  detail: string;
}

export interface RuntimeAdapter {
  testConnection(): Promise<TargetTestResponse>;
  syncInstance?(localRoot: string, remoteConfig: SshTargetConfig): Promise<void>;
  composeUp(composeFile: string, slug: string): Promise<string>;
  composeStop(composeFile: string, slug: string): Promise<string>;
  composeRestart(composeFile: string, slug: string): Promise<string>;
  composeUpdate(composeFile: string, slug: string): Promise<string>;
  composePs(composeFile: string, slug: string): Promise<RuntimeContainerInfo[]>;
  streamComposeLogs(
    composeFile: string,
    slug: string,
    callbacks: {
      onStdout: (line: string) => void;
      onStderr: (line: string) => void;
      onClose?: (code: number | null) => void;
    },
  ): ChildProcess;
  checkPorts(target: TargetConfig, ports: number[]): Promise<PortCheckResult>;
  inspectNetwork(target: TargetConfig, ports: number[]): Promise<ProjectNetwork>;
  ensureFirewall(target: TargetConfig, ports: number[], slug: string): Promise<string>;
  createRemoteBackup?(remotePath: string, backupFile: string): Promise<void>;
}

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

/** Optional line-by-line streaming callbacks for long-running operations. */
export interface StreamingCallbacks {
  onStdout?: (line: string) => void;
  onStderr?: (line: string) => void;
}

export interface RuntimeAdapter {
  testConnection(): Promise<TargetTestResponse>;
  syncInstance?(localRoot: string, remoteConfig: SshTargetConfig, callbacks?: StreamingCallbacks): Promise<void>;
  composeUp(composeFile: string, slug: string, callbacks?: StreamingCallbacks): Promise<string>;
  composeStop(composeFile: string, slug: string, callbacks?: StreamingCallbacks): Promise<string>;
  composeRestart(composeFile: string, slug: string, callbacks?: StreamingCallbacks): Promise<string>;
  composeUpdate(composeFile: string, slug: string, callbacks?: StreamingCallbacks): Promise<string>;
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
  prefetchMods(
    composeFile: string,
    slug: string,
    callbacks: StreamingCallbacks,
  ): Promise<string>;
  createRemoteBackup?(remotePath: string, backupFile: string): Promise<void>;
}

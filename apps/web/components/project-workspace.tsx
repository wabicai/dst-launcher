'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import useSWR from 'swr';
import {
  AlertTriangle,
  ArrowLeft,
  CloudDownload,
  HardDriveDownload,
  Play,
  Power,
  RefreshCw,
  Server,
  ShieldCheck,
  TerminalSquare,
  Waypoints,
} from 'lucide-react';
import type { ProjectAction, ProjectDetail, ProjectNetwork, TargetConfig } from '@dst-launcher/shared';
import { getApiClient } from '@/lib/api';
import { formatBackupSize, formatDateTime } from '@/lib/format';
import { CopyButton } from './copy-button';
import { ProjectForm, type ProjectFormValue } from './project-form';
import { ProjectModsWorkbench } from './project-mods-workbench';
import { RuntimeConsole } from './runtime-console';
import { StatusBadge } from './status-badge';
import { Button } from './ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';

const actionLabels: Record<ProjectAction, string> = {
  deploy: '部署',
  start: '启动',
  stop: '停止',
  restart: '重启',
  backup: '备份',
  update: '更新',
  'check-ports': '查端口',
  'ensure-firewall': '开放 UDP',
  'prefetch-mods': '预拉取模组',
};

const actionGuides: Record<ProjectAction, string> = {
  deploy: '配置与 compose 已重新同步。',
  start: '请在控制台里确认启动日志。',
  stop: '容器已停止。',
  restart: '容器将按当前配置重新启动。',
  backup: '新的备份记录会出现在备份页。',
  update: '镜像会尝试更新。',
  'check-ports': '端口占用已重新检查。',
  'ensure-firewall': '当前 6 个 UDP 端口会执行幂等放通检查。',
  'prefetch-mods': '预拉取日志会进入模组工作台。',
};

export function ProjectWorkspace({ projectId }: { projectId: string }) {
  const client = useMemo(() => getApiClient(), []);
  const { data, error, mutate, isLoading } = useSWR(['project', projectId], () => client.getProject(projectId), {
    refreshInterval: 5000,
  });
  const [actionBusy, setActionBusy] = useState<ProjectAction | null>(null);
  const [message, setMessage] = useState('');

  async function runAction(action: ProjectAction) {
    setActionBusy(action);
    setMessage('');
    try {
      await client.runAction(projectId, action);
      setMessage(`已提交${actionLabels[action]}：${actionGuides[action]}`);
      await mutate();
    } catch (actionError) {
      const detail = actionError instanceof Error ? actionError.message : '请查看控制台。';
      setMessage(`${actionLabels[action]}失败：${detail}`);
    } finally {
      setActionBusy(null);
    }
  }

  async function saveConfig(input: ProjectFormValue) {
    setMessage('');
    await client.updateProject(projectId, {
      name: input.name,
      description: input.description,
      target: input.target,
      clusterConfig: input.clusterConfig,
    });
    await mutate();
  }

  async function testTarget(target: TargetConfig) {
    const result = await client.testTarget({ target });
    if (!result.ok) {
      throw new Error(result.detail || result.message);
    }
    setMessage(result.detail || '连接测试通过。');
  }

  if (isLoading) {
    return <div className="rounded-2xl border border-border bg-panel/88 p-8 text-sm text-muted-foreground">项目加载中...</div>;
  }

  if (error || !data) {
    return <div className="rounded-2xl border border-danger/30 bg-danger/10 p-8 text-sm text-danger">{error instanceof Error ? error.message : '项目不存在'}</div>;
  }

  return (
    <div className="space-y-4">
      <section className="overflow-hidden rounded-2xl border border-border bg-panel/96 shadow-panel">
        <div className="flex flex-col gap-4 border-b border-border px-5 py-5 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-3">
              <Link href="/" className="inline-flex items-center gap-2 text-sm text-muted-foreground transition hover:text-foreground">
                <ArrowLeft className="size-4" />
                返回项目列表
              </Link>
              <StatusBadge status={data.status} />
            </div>

            <div>
              <h2 data-testid="workspace-project-name" className="text-2xl font-semibold tracking-tight text-foreground">{data.name}</h2>
              {data.description ? <p className="mt-1 text-sm text-muted-foreground">{data.description}</p> : null}
            </div>

            <div data-testid="workspace-project-meta" className="flex flex-wrap gap-2 text-sm text-muted-foreground">
              <MetaPill label="slug" value={data.slug} copyValue={data.slug} />
              <MetaPill label="target" value={data.target.type === 'local' ? '本地 Docker' : '远程 SSH Docker'} />
              {data.deployment?.targetPath ? <MetaPill label="path" value={data.deployment.targetPath} copyValue={data.deployment.targetPath} /> : null}
            </div>
          </div>

          <div data-testid="workspace-actions" className="w-full max-w-[480px] space-y-3">
            <div data-testid="workspace-primary-actions" className="flex flex-wrap gap-3">
              <ActionButton icon={CloudDownload} label="部署" testId="action-deploy-button" busy={actionBusy === 'deploy'} onClick={() => runAction('deploy')} />
              <ActionButton icon={Play} label="启动" testId="action-start-button" busy={actionBusy === 'start'} onClick={() => runAction('start')} />
            </div>
            <div data-testid="workspace-secondary-actions" className="flex flex-wrap gap-3">
              <ActionButton icon={Power} label="停止" testId="action-stop-button" busy={actionBusy === 'stop'} onClick={() => runAction('stop')} variant="secondary" />
              <ActionButton icon={RefreshCw} label="重启" testId="action-restart-button" busy={actionBusy === 'restart'} onClick={() => runAction('restart')} variant="secondary" />
              <ActionButton icon={HardDriveDownload} label="备份" testId="action-backup-button" busy={actionBusy === 'backup'} onClick={() => runAction('backup')} variant="secondary" />
              <ActionButton icon={ShieldCheck} label="查端口" testId="action-check-ports-button" busy={actionBusy === 'check-ports'} onClick={() => runAction('check-ports')} variant="secondary" />
            </div>
          </div>
        </div>

        <div className="grid gap-3 px-5 py-4 md:grid-cols-3">
          <StatRow label="目标" value={data.target.type === 'local' ? '本地 Docker' : '远程 VPS'} detail={data.target.type === 'local' ? data.target.dockerContext : `${data.target.username}@${data.target.host}:${data.target.port}`} icon={Server} />
          <StatRow label="最近部署" value={formatDateTime(data.deployment?.lastDeployedAt ?? null)} detail={data.deployment?.targetPath ?? '尚未部署'} icon={CloudDownload} />
          <StatRow label="运行概况" value={data.runtime.containers.length > 0 ? `${data.runtime.containers.length} 个容器` : '无活跃容器'} detail={data.runtime.dockerAvailable ? 'Docker 可用' : 'Docker 不可用'} icon={TerminalSquare} />
        </div>
      </section>

      {message ? <div className="rounded-2xl border border-border bg-panel/88 px-4 py-3 text-sm text-muted-foreground">{message}</div> : null}

      <div className="grid gap-4 xl:grid-cols-[300px_minmax(0,1fr)]">
        <div className="space-y-4">
          <RuntimePanel project={data} />
          <NetworkPanel project={data} busy={actionBusy === 'ensure-firewall'} onEnsureFirewall={() => runAction('ensure-firewall')} />
        </div>

        <div className="space-y-4">
          <Tabs defaultValue="config">
            <div className="flex items-center justify-between gap-3">
              <TabsList>
                <TabsTrigger value="config">配置</TabsTrigger>
                <TabsTrigger value="mods" data-testid="mods-tab-trigger">模组</TabsTrigger>
                <TabsTrigger value="console">控制台</TabsTrigger>
                <TabsTrigger value="backups">备份</TabsTrigger>
              </TabsList>
              <div className="rounded-full border border-border bg-inset px-3 py-1 font-mono text-[11px] text-muted-foreground">Workspace</div>
            </div>
            <TabsContent value="config">
              <ProjectForm mode="edit" initialProject={data} onSubmit={saveConfig} onTestTarget={testTarget} busy={actionBusy !== null} />
            </TabsContent>
            <TabsContent value="mods">
              <ProjectModsWorkbench projectId={projectId} onProjectChanged={mutate} />
            </TabsContent>
            <TabsContent value="console">
              <RuntimeConsole projectId={projectId} />
            </TabsContent>
            <TabsContent value="backups">
              <BackupPanel project={data} onBackup={() => runAction('backup')} busy={actionBusy === 'backup'} />
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}

function ActionButton({ icon: Icon, label, busy, onClick, variant = 'primary', testId }: { icon: typeof Play; label: string; busy: boolean; onClick: () => void; variant?: 'primary' | 'secondary'; testId?: string }) {
  return (
    <Button data-testid={testId} variant={variant} disabled={busy} onClick={onClick}>
      <Icon className="size-4" />
      {busy ? '处理中...' : label}
    </Button>
  );
}

function RuntimePanel({ project }: { project: ProjectDetail }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>运行检查</CardTitle>
        <CardDescription>先确认 Docker、部署目录和容器状态。</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <ChecklistRow label="Docker" value={project.runtime.dockerAvailable ? '已连接' : '不可用'} tone={project.runtime.dockerAvailable ? 'success' : 'warning'} />
        <ChecklistRow label="部署目录" value={project.deployment?.targetPath ?? '尚未部署'} tone={project.deployment?.targetPath ? 'neutral' : 'warning'} copyValue={project.deployment?.targetPath ?? undefined} />
        <ChecklistRow label="最近部署" value={formatDateTime(project.deployment?.lastDeployedAt ?? null)} tone="neutral" />

        <div className="space-y-3">
          {project.runtime.containers.length === 0 ? (
            <div className="rounded-2xl border border-border bg-inset/60 p-4 text-sm text-muted-foreground">当前没有活跃容器。</div>
          ) : (
            project.runtime.containers.map((container) => (
              <div key={container.service} className="rounded-2xl border border-border bg-inset/60 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="text-sm font-medium text-foreground">{container.service}</div>
                  <span className="rounded-full border border-border bg-panel px-2 py-1 font-mono text-[11px] text-muted-foreground">{container.state}</span>
                </div>
                {container.health ? <div className="mt-2 text-sm text-muted-foreground">health: {container.health}</div> : null}
              </div>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function NetworkPanel({ project, busy, onEnsureFirewall }: { project: ProjectDetail; busy: boolean; onEnsureFirewall: () => void }) {
  const network = project.network;
  const statusTone = getNetworkTone(network.status);
  const requiresManualAction = network.status === 'needs_attention' || network.status === 'unsupported' || network.status === 'unknown';
  const nextStep = getNetworkNextStep(network, project.target.type);

  return (
    <Card data-testid="workspace-network-panel">
      <CardHeader>
        <CardTitle>网络 / 放通</CardTitle>
        <CardDescription>看端口是否真的对外可达。</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className={`rounded-2xl border p-4 ${statusTone.panel}`}>
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-2">
              <div data-testid="workspace-network-status" className="flex items-center gap-2 text-sm font-medium text-foreground">
                {statusTone.icon === 'warning' ? <AlertTriangle className="size-4" /> : <ShieldCheck className="size-4" />}
                {getNetworkHeading(network, project.target.type)}
              </div>
              <p className="text-sm leading-6 text-muted-foreground">{network.detail || nextStep}</p>
            </div>
            <div className={`rounded-full border px-3 py-1 text-[11px] tracking-[0.14em] ${statusTone.badge}`}>
              {getNetworkStatusLabel(network.status)}
            </div>
          </div>
        </div>

        <ChecklistRow label="Docker UDP 映射" value={`${network.requiredUdpPorts.length} 个端口`} tone="neutral" />
        <ChecklistRow label="主机防火墙" value={describeFirewallProvider(network)} tone={network.firewallSupported ? 'success' : 'warning'} />

        <PortRow label="所需 UDP 端口" ports={network.requiredUdpPorts} tone="neutral" />
        <PortRow label="已放通" ports={network.openUdpPorts} tone="success" emptyText="当前还没有检测到已放通的 UDP 端口。" />
        <PortRow label="缺失" ports={network.missingUdpPorts} tone="warning" emptyText="当前没有缺失端口。" />

        <div className="rounded-2xl border border-border bg-inset/60 px-4 py-4 text-sm leading-6 text-muted-foreground">
          <div className="mb-1 text-sm font-medium text-foreground">下一步</div>
          <p>{nextStep}</p>
        </div>

        {project.target.type === 'ssh' ? (
          <Button data-testid="action-ensure-firewall-button" variant={requiresManualAction ? 'primary' : 'secondary'} disabled={busy} onClick={onEnsureFirewall}>
            <ShieldCheck className="size-4" />
            {busy ? '处理中...' : network.missingUdpPorts.length > 0 ? '开放 UDP' : '重新检查放通'}
          </Button>
        ) : null}
      </CardContent>
    </Card>
  );
}

function StatRow({ label, value, detail, icon: Icon }: { label: string; value: string; detail: string; icon: typeof Server }) {
  return (
    <div className="rounded-2xl border border-border bg-inset/60 px-4 py-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">{label}</div>
          <div className="mt-2 text-base font-semibold text-foreground">{value}</div>
        </div>
        <span className="inline-flex size-9 items-center justify-center rounded-xl border border-border bg-panel text-primary">
          <Icon className="size-4" />
        </span>
      </div>
      <div className="mt-2 break-all text-sm text-muted-foreground">{detail}</div>
    </div>
  );
}

function ChecklistRow({ label, value, tone, copyValue }: { label: string; value: string; tone: 'neutral' | 'success' | 'warning'; copyValue?: string }) {
  const toneClass = {
    neutral: 'border-border bg-inset/60 text-foreground',
    success: 'border-success/20 bg-success/10 text-success',
    warning: 'border-warning/20 bg-warning/10 text-warning',
  }[tone];

  return (
    <div className={`rounded-2xl border px-4 py-4 ${toneClass}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">{label}</div>
          <div className="mt-2 break-all font-mono text-[13px]">{value}</div>
        </div>
        {copyValue ? <CopyButton value={copyValue} label="复制" /> : null}
      </div>
    </div>
  );
}

function PortRow({ label, ports, tone, emptyText }: { label: string; ports: number[]; tone: 'neutral' | 'success' | 'warning'; emptyText?: string }) {
  const toneClass = {
    neutral: 'border-border bg-inset text-foreground',
    success: 'border-success/25 bg-success/10 text-success',
    warning: 'border-warning/25 bg-warning/10 text-warning',
  }[tone];

  return (
    <div className="space-y-2">
      <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">{label}</div>
      {ports.length === 0 ? (
        <div className="rounded-2xl border border-border bg-inset/60 px-4 py-3 text-sm text-muted-foreground">{emptyText ?? '暂无数据。'}</div>
      ) : (
        <div className="flex flex-wrap gap-2">
          {ports.map((port) => (
            <span key={`${label}-${port}`} className={`rounded-full border px-3 py-1 font-mono text-[12px] ${toneClass}`}>
              {port}/udp
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function MetaPill({ label, value, copyValue }: { label: string; value: string; copyValue?: string }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-border bg-inset px-3 py-1.5 text-[12px] text-muted-foreground">
      <span className="uppercase tracking-[0.14em]">{label}</span>
      <span className="font-mono text-foreground">{value}</span>
      {copyValue ? <CopyButton value={copyValue} label="复制" className="h-6 px-2" /> : null}
    </span>
  );
}

function getNetworkTone(status: ProjectNetwork['status']) {
  switch (status) {
    case 'ready':
      return {
        icon: 'success' as const,
        panel: 'border-success/25 bg-success/10',
        badge: 'border-success/25 bg-success/10 text-success',
      };
    case 'not_applicable':
      return {
        icon: 'success' as const,
        panel: 'border-border bg-inset/60',
        badge: 'border-border bg-inset text-muted-foreground',
      };
    case 'needs_attention':
      return {
        icon: 'warning' as const,
        panel: 'border-warning/25 bg-warning/10',
        badge: 'border-warning/25 bg-warning/10 text-warning',
      };
    case 'unsupported':
    case 'unknown':
      return {
        icon: 'warning' as const,
        panel: 'border-danger/25 bg-danger/10',
        badge: 'border-danger/25 bg-danger/10 text-danger',
      };
  }
}

function getNetworkStatusLabel(status: ProjectNetwork['status']) {
  switch (status) {
    case 'ready':
      return '已放通';
    case 'not_applicable':
      return '本地模式';
    case 'needs_attention':
      return '待处理';
    case 'unsupported':
      return '不支持自动处理';
    case 'unknown':
      return '状态未知';
  }
}

function getNetworkHeading(network: ProjectNetwork, targetType: ProjectDetail['target']['type']) {
  if (targetType === 'local') {
    return '本地模式无需额外开放 VPS UDP 端口';
  }

  if (network.status === 'ready') {
    return '远端主机 UDP 端口已准备完成';
  }

  if (network.status === 'needs_attention') {
    return '远端主机仍有 UDP 端口未放通';
  }

  if (network.status === 'unsupported') {
    return '当前目标未检测到可自动管理的防火墙';
  }

  return '远端网络状态需要进一步确认';
}

function getNetworkNextStep(network: ProjectNetwork, targetType: ProjectDetail['target']['type']) {
  if (targetType === 'local') {
    return '本地模式重点关注端口占用和容器日志。';
  }

  if (network.status === 'ready') {
    return '可以继续部署、启动，并尝试让外网玩家加入。';
  }

  if (network.status === 'needs_attention') {
    return '先点击“开放 UDP”，如果仍无法加入，再检查云厂商安全组。';
  }

  if (network.status === 'unsupported') {
    return '部署可以继续，但你需要手动开放这 6 个 UDP 端口。';
  }

  return '建议先重新检查放通状态，再结合控制台输出确认问题来源。';
}

function describeFirewallProvider(network: ProjectNetwork) {
  if (network.firewallProvider === 'ufw') {
    return network.firewallSupported ? 'UFW（可自动处理）' : 'UFW';
  }

  if (network.firewallProvider === 'none') {
    return '不适用';
  }

  return network.firewallSupported ? '可检测，待识别' : '暂不支持自动处理';
}

function BackupPanel({ project, onBackup, busy }: { project: ProjectDetail; onBackup: () => void; busy: boolean }) {
  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <CardTitle>备份记录</CardTitle>
            <CardDescription>最近 10 份记录。</CardDescription>
          </div>
          <Button variant="secondary" onClick={onBackup} disabled={busy}>
            <HardDriveDownload className="size-4" />
            {busy ? '备份中...' : '立即备份'}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {project.backups.length === 0 ? (
          <div className="rounded-2xl border border-border bg-inset/60 p-4 text-sm text-muted-foreground">暂时还没有备份记录。</div>
        ) : (
          project.backups.map((backup) => (
            <div key={backup.id} className="rounded-2xl border border-border bg-inset/60 p-4">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <div className="text-sm font-medium text-foreground">{backup.filename}</div>
                  <div className="mt-1 text-sm text-muted-foreground">{formatDateTime(backup.createdAt)} · {formatBackupSize(backup.sizeBytes)}</div>
                </div>
                <CopyButton value={backup.location} label="复制路径" />
              </div>
              <div className="mt-3 break-all rounded-xl border border-border bg-panel px-3 py-2 font-mono text-[12px] text-muted-foreground">{backup.location}</div>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}

'use client';

import { useMemo, useState } from 'react';
import useSWR from 'swr';
import {
  AlertTriangle,
  ArrowLeft,
  CloudDownload,
  Play,
  Power,
  RefreshCw,
  Save,
  Server,
  ShieldCheck,
  Waypoints,
} from 'lucide-react';
import { getApiClient } from '@/lib/api';
import { ProjectForm, type ProjectFormValue } from './project-form';
import { RuntimeConsole } from './runtime-console';
import { Button } from './ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { StatusBadge } from './status-badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import type { ProjectAction, ProjectDetail, ProjectNetwork, TargetConfig } from '@dst-launcher/shared';

export function ProjectWorkspace({ projectId }: { projectId: string }) {
  const client = useMemo(() => getApiClient(), []);
  const { data, error, mutate, isLoading } = useSWR(['project', projectId], () => client.getProject(projectId), {
    refreshInterval: 5000,
  });
  const [actionBusy, setActionBusy] = useState<ProjectAction | null>(null);
  const [message, setMessage] = useState<string>('');

  async function runAction(action: ProjectAction) {
    setActionBusy(action);
    setMessage('');
    try {
      await client.runAction(projectId, action);
      setMessage(`已提交 ${action} 操作`);
      await mutate();
    } catch (actionError) {
      setMessage(actionError instanceof Error ? actionError.message : '操作失败');
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
    setMessage('配置已保存');
  }

  async function testTarget(target: TargetConfig) {
    const result = await client.testTarget({ target });
    if (!result.ok) {
      throw new Error(result.detail || result.message);
    }
    setMessage(result.detail || result.message);
  }

  if (isLoading) {
    return <div className="rounded-3xl border border-border bg-card/60 p-8 text-sm text-muted-foreground">项目加载中...</div>;
  }

  if (error || !data) {
    return <div className="rounded-3xl border border-danger/30 bg-danger/10 p-8 text-sm text-danger">{error instanceof Error ? error.message : '项目不存在'}</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-[2rem] border border-border bg-card/70 p-6 shadow-panel">
        <div>
          <div className="mb-2 flex flex-wrap items-center gap-3">
            <a href="/" className="inline-flex items-center gap-2 text-sm text-muted-foreground transition hover:text-foreground">
              <ArrowLeft className="size-4" />
              返回项目列表
            </a>
            <StatusBadge status={data.status} />
          </div>
          <h1 data-testid="workspace-project-name" className="font-display text-3xl text-foreground">{data.name}</h1>
          <p data-testid="workspace-project-meta" className="mt-2 text-sm text-muted-foreground">{data.description || '暂无项目说明'} · `{data.slug}` · {data.target.type === 'local' ? '本地 Docker' : '远程 SSH Docker'}</p>
        </div>
        <div data-testid="workspace-actions" className="flex flex-wrap gap-3">
          <ActionButton icon={CloudDownload} label="部署" testId="action-deploy-button" busy={actionBusy === 'deploy'} onClick={() => runAction('deploy')} />
          <ActionButton icon={Play} label="启动" testId="action-start-button" busy={actionBusy === 'start'} onClick={() => runAction('start')} />
          <ActionButton icon={Power} label="停止" testId="action-stop-button" busy={actionBusy === 'stop'} onClick={() => runAction('stop')} variant="secondary" />
          <ActionButton icon={RefreshCw} label="重启" testId="action-restart-button" busy={actionBusy === 'restart'} onClick={() => runAction('restart')} variant="secondary" />
          <ActionButton icon={Save} label="备份" testId="action-backup-button" busy={actionBusy === 'backup'} onClick={() => runAction('backup')} variant="secondary" />
          <ActionButton icon={ShieldCheck} label="查端口" testId="action-check-ports-button" busy={actionBusy === 'check-ports'} onClick={() => runAction('check-ports')} variant="secondary" />
        </div>
      </div>
      {message ? <div className="rounded-2xl border border-border bg-muted/50 px-4 py-3 text-sm text-muted-foreground">{message}</div> : null}
      <div className="grid gap-6 xl:grid-cols-[0.8fr_1.2fr]">
        <div className="space-y-6">
          <RuntimePanel project={data} />
          <NetworkPanel
            project={data}
            busy={actionBusy === 'ensure-firewall'}
            onEnsureFirewall={() => runAction('ensure-firewall')}
          />
        </div>
        <Tabs defaultValue="config">
          <TabsList>
            <TabsTrigger value="config">配置</TabsTrigger>
            <TabsTrigger value="console">控制台</TabsTrigger>
            <TabsTrigger value="backups">备份</TabsTrigger>
          </TabsList>
          <TabsContent value="config">
            <ProjectForm mode="edit" initialProject={data} onSubmit={saveConfig} onTestTarget={testTarget} busy={actionBusy !== null} />
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
  );
}

function ActionButton({ icon: Icon, label, busy, onClick, variant = 'primary', testId }: { icon: typeof Play; label: string; busy: boolean; onClick: () => void; variant?: 'primary' | 'secondary'; testId?: string; }) {
  return (
    <Button data-testid={testId} variant={variant} disabled={busy} onClick={onClick}>
      <Icon className="mr-2 size-4" />
      {busy ? '处理中...' : label}
    </Button>
  );
}

function RuntimePanel({ project }: { project: ProjectDetail }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>当前运行态</CardTitle>
        <CardDescription>这里展示 Docker 与容器状态，便于判断是否需要重新部署、更新或检查端口。</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-2xl border border-border bg-card/40 p-4">
          <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Docker</div>
          <div className="mt-2 text-lg font-medium text-foreground">{project.runtime.dockerAvailable ? '已连接' : '不可用'}</div>
        </div>
        <div className="space-y-3">
          {project.runtime.containers.length === 0 ? (
            <div className="rounded-2xl border border-border bg-card/40 p-4 text-sm text-muted-foreground">当前没有活跃容器。</div>
          ) : (
            project.runtime.containers.map((container: ProjectDetail['runtime']['containers'][number]) => (
              <div key={container.service} className="rounded-2xl border border-border bg-card/40 p-4">
                <div className="font-medium text-foreground">{container.service}</div>
                <div className="mt-2 text-sm text-muted-foreground">state: {container.state}{container.health ? ` · health: ${container.health}` : ''}</div>
              </div>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function NetworkPanel({
  project,
  busy,
  onEnsureFirewall,
}: {
  project: ProjectDetail;
  busy: boolean;
  onEnsureFirewall: () => void;
}) {
  const network = project.network;
  const statusTone = getNetworkTone(network.status);
  const requiresManualAction = network.status === 'needs_attention' || network.status === 'unsupported' || network.status === 'unknown';

  return (
    <Card data-testid="workspace-network-panel">
      <CardHeader>
        <CardTitle>网络 / 放通</CardTitle>
        <CardDescription>Docker Compose 会直接映射 6 个 UDP 端口；远程模式会检测远端 UFW，并在部署/启动前自动尽量放通。</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className={`rounded-2xl border p-4 ${statusTone.panel}`}>
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-2">
              <div data-testid="workspace-network-status" className="flex items-center gap-2 text-sm font-medium">
                {statusTone.icon === 'warning' ? <AlertTriangle className="size-4" /> : <ShieldCheck className="size-4" />}
                {getNetworkHeading(network, project.target.type)}
              </div>
              <p className="text-sm leading-6 text-muted-foreground">{network.detail || '当前没有额外的网络说明。'}</p>
            </div>
            <div className={`rounded-full border px-3 py-1 text-xs uppercase tracking-[0.18em] ${statusTone.badge}`}>
              {getNetworkStatusLabel(network.status)}
            </div>
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <InfoMetric
            icon={Server}
            title="Docker UDP 映射"
            value={`${network.requiredUdpPorts.length} 个端口`}
            detail="Compose 会按 Master / Caves 的 6 个 UDP 端口直接映射到宿主机。"
          />
          <InfoMetric
            icon={Waypoints}
            title="主机防火墙"
            value={describeFirewallProvider(network)}
            detail={project.target.type === 'ssh' ? 'V1 当前只自动处理 Ubuntu 上的 UFW。' : '本地模式不额外接管宿主机防火墙。'}
          />
        </div>

        <PortRow label="所需 UDP 端口" ports={network.requiredUdpPorts} tone="neutral" />
        <PortRow label="已放通" ports={network.openUdpPorts} tone="success" emptyText="当前还没有检测到已放通的 UDP 端口。" />
        <PortRow label="缺失" ports={network.missingUdpPorts} tone="warning" emptyText="当前没有缺失端口。" />

        {project.target.type === 'ssh' ? (
          <div className="rounded-2xl border border-border bg-card/40 px-4 py-3 text-xs leading-6 text-muted-foreground">
            远程模式下，`部署` 和 `启动` 会先执行一次 UFW 检测 / 放通；如果目标机没有安装 UFW，Launcher 会继续部署，但会明确提示你手动处理云防火墙或其他规则体系。
          </div>
        ) : null}

        {project.target.type === 'ssh' ? (
          <div className="flex flex-wrap gap-3">
            <Button
              data-testid="action-ensure-firewall-button"
              variant={requiresManualAction ? 'primary' : 'secondary'}
              disabled={busy}
              onClick={onEnsureFirewall}
            >
              <ShieldCheck className="mr-2 size-4" />
              {busy ? '处理中...' : network.missingUdpPorts.length > 0 ? '开放 UDP' : '重新检查放通'}
            </Button>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function InfoMetric({
  icon: Icon,
  title,
  value,
  detail,
}: {
  icon: typeof Server;
  title: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="rounded-2xl border border-border bg-card/40 p-4">
      <div className="mb-3 inline-flex rounded-2xl border border-white/10 bg-white/5 p-3 text-primary">
        <Icon className="size-4" />
      </div>
      <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">{title}</div>
      <div className="mt-2 text-lg font-medium text-foreground">{value}</div>
      <div className="mt-2 text-sm leading-6 text-muted-foreground">{detail}</div>
    </div>
  );
}

function PortRow({
  label,
  ports,
  tone,
  emptyText,
}: {
  label: string;
  ports: number[];
  tone: 'neutral' | 'success' | 'warning';
  emptyText?: string;
}) {
  const toneClass = {
    neutral: 'border-border bg-card text-foreground',
    success: 'border-success/30 bg-success/10 text-success',
    warning: 'border-warning/30 bg-warning/10 text-warning',
  }[tone];

  return (
    <div className="space-y-3">
      <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">{label}</div>
      {ports.length === 0 ? (
        <div className="rounded-2xl border border-border bg-card/30 px-4 py-3 text-sm text-muted-foreground">{emptyText ?? '暂无数据。'}</div>
      ) : (
        <div className="flex flex-wrap gap-2">
          {ports.map((port) => (
            <span key={`${label}-${port}`} className={`rounded-full border px-3 py-1 text-sm ${toneClass}`}>
              {port}/udp
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function getNetworkTone(status: ProjectNetwork['status']) {
  switch (status) {
    case 'ready':
      return {
        icon: 'success' as const,
        panel: 'border-success/30 bg-success/10',
        badge: 'border-success/40 bg-success/10 text-success',
      };
    case 'not_applicable':
      return {
        icon: 'success' as const,
        panel: 'border-accent/30 bg-accent/10',
        badge: 'border-accent/40 bg-accent/10 text-accent-foreground',
      };
    case 'needs_attention':
      return {
        icon: 'warning' as const,
        panel: 'border-warning/30 bg-warning/10',
        badge: 'border-warning/40 bg-warning/10 text-warning',
      };
    case 'unsupported':
    case 'unknown':
      return {
        icon: 'warning' as const,
        panel: 'border-danger/30 bg-danger/10',
        badge: 'border-danger/40 bg-danger/10 text-danger',
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
        <CardTitle>备份记录</CardTitle>
        <CardDescription>V1 默认保留最近 10 份本地备份；远程模式会在 VPS 的备份目录生成压缩包。</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Button variant="secondary" onClick={onBackup} disabled={busy}>{busy ? '备份中...' : '立即备份'}</Button>
        <div className="space-y-3">
          {project.backups.length === 0 ? (
            <div className="rounded-2xl border border-border bg-card/40 p-4 text-sm text-muted-foreground">暂时还没有备份记录。</div>
          ) : (
            project.backups.map((backup: ProjectDetail['backups'][number]) => (
              <div key={backup.id} className="rounded-2xl border border-border bg-card/40 p-4">
                <div className="font-medium text-foreground">{backup.filename}</div>
                <div className="mt-2 text-xs text-muted-foreground">{backup.location}</div>
                <div className="mt-2 text-sm text-muted-foreground">{new Date(backup.createdAt).toLocaleString()} · {backup.sizeBytes > 0 ? `${Math.round(backup.sizeBytes / 1024)} KB` : '远程备份'}</div>
              </div>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  );
}

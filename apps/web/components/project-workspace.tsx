'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import useSWR from 'swr';
import { toast } from 'sonner';
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  CloudDownload,
  Copy,
  Download,
  ExternalLink,
  Globe,
  HardDriveDownload,
  LoaderCircle,
  Play,
  Power,
  RefreshCw,
  ShieldCheck,
  X,
} from 'lucide-react';
import type { ProjectAction, ProjectDetail, ProjectNetwork, TargetConfig } from '@dst-launcher/shared';
import { getApiClient } from '@/lib/api';
import { formatBackupSize, formatDateTime } from '@/lib/format';
import { useLogStream, type ConsoleLine } from '@/hooks/use-log-stream';
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
  'install-server': '安装/更新服务器',
  'start-tunnel': '启动穿透',
  'stop-tunnel': '停止穿透',
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
  'install-server': 'SteamCMD 安装/更新完成。',
  'start-tunnel': 'NAT 穿透已启动。',
  'stop-tunnel': 'NAT 穿透已停止。',
};

export function ProjectWorkspace({ projectId }: { projectId: string }) {
  const client = useMemo(() => getApiClient(), []);
  const { data, error, mutate, isLoading } = useSWR(['project', projectId], () => client.getProject(projectId), {
    refreshInterval: 5000,
  });
  const [actionBusy, setActionBusy] = useState<ProjectAction | null>(null);
  const { lines, lastTaskEvent } = useLogStream(projectId);

  async function runAction(action: ProjectAction) {
    setActionBusy(action);
    try {
      await client.runAction(projectId, action);
      toast.success(`${actionLabels[action]}`, { description: actionGuides[action] });
      await mutate();
    } catch (actionError) {
      const detail = actionError instanceof Error ? actionError.message : '请查看控制台。';
      toast.error(`${actionLabels[action]}失败`, { description: detail });
    } finally {
      setActionBusy(null);
    }
  }

  async function saveConfig(input: ProjectFormValue) {
    await client.updateProject(projectId, {
      name: input.name,
      description: input.description,
      target: input.target,
      clusterConfig: input.clusterConfig,
    });
    toast.success('配置已保存');
    await mutate();
  }

  async function testTarget(target: TargetConfig) {
    const result = await client.testTarget({ target });
    if (!result.ok) {
      throw new Error(result.detail || result.message);
    }
    toast.success('连接测试通过', { description: result.detail });
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
        <div className="flex flex-col gap-4 px-5 py-5 lg:flex-row lg:items-start lg:justify-between">
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
              <p data-testid="workspace-project-meta" className="mt-1 text-sm text-muted-foreground">
                <span className="font-mono">{data.slug}</span>
                <span className="mx-2">·</span>
                {data.target.type === 'local' ? '本地 Docker' : data.target.type === 'native' ? 'Mac 原生' : '远程 SSH Docker'}
                {data.description ? <><span className="mx-2">·</span>{data.description}</> : null}
              </p>
            </div>
          </div>

          <div data-testid="workspace-actions" className="w-full max-w-[520px] space-y-3">
            <div data-testid="workspace-primary-actions" className="flex flex-wrap gap-3">
              <ActionButton icon={CloudDownload} label="部署" testId="action-deploy-button" busy={actionBusy === 'deploy'} onClick={() => runAction('deploy')} />
              <ActionButton icon={Play} label="启动" testId="action-start-button" busy={actionBusy === 'start'} onClick={() => runAction('start')} />
            </div>
            <div data-testid="workspace-secondary-actions" className="flex flex-wrap gap-3">
              <ActionButton icon={Power} label="停止" testId="action-stop-button" busy={actionBusy === 'stop'} onClick={() => runAction('stop')} variant="secondary" />
              <ActionButton icon={RefreshCw} label="重启" testId="action-restart-button" busy={actionBusy === 'restart'} onClick={() => runAction('restart')} variant="secondary" />
              <ActionButton icon={HardDriveDownload} label="备份" testId="action-backup-button" busy={actionBusy === 'backup'} onClick={() => runAction('backup')} variant="secondary" />
              <ActionButton icon={ShieldCheck} label="查端口" testId="action-check-ports-button" busy={actionBusy === 'check-ports'} onClick={() => runAction('check-ports')} variant="secondary" />
              {data.target.type === 'native' && (
                <ActionButton icon={Download} label="安装/更新服务器" testId="action-install-server-button" busy={actionBusy === 'install-server'} onClick={() => runAction('install-server')} variant="secondary" />
              )}
            </div>
          </div>
        </div>

        {/* Action Log Strip — visible while action is running */}
        <ActionLogStrip lines={lines} actionBusy={actionBusy} lastTaskEvent={lastTaskEvent} />
      </section>

      <Tabs defaultValue="status">
        <div className="flex items-center justify-between gap-3">
          <TabsList>
            <TabsTrigger value="status">状态</TabsTrigger>
            <TabsTrigger value="config">配置</TabsTrigger>
            <TabsTrigger value="mods" data-testid="mods-tab-trigger">模组</TabsTrigger>
            <TabsTrigger value="console">控制台</TabsTrigger>
            <TabsTrigger value="backups">备份</TabsTrigger>
          </TabsList>
          <div className="rounded-full border border-border bg-inset px-3 py-1 font-mono text-[11px] text-muted-foreground">Workspace</div>
        </div>
        <TabsContent value="status">
          <div className="space-y-4">
            {/* Boot Status Banner — prominent progress/error indicator */}
            <BootStatusBanner lines={lines} project={data} />
            <div className="grid gap-4 md:grid-cols-2">
              <RuntimePanel project={data} />
              <NetworkPanel project={data} busy={actionBusy === 'ensure-firewall'} onEnsureFirewall={() => runAction('ensure-firewall')} />
            </div>
            {(data.target.type === 'local' || data.target.type === 'native') && (
              <TunnelPanel
                project={data}
                busyStart={actionBusy === 'start-tunnel'}
                busyStop={actionBusy === 'stop-tunnel'}
                onStart={() => runAction('start-tunnel')}
                onStop={() => runAction('stop-tunnel')}
              />
            )}
          </div>
        </TabsContent>
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
  );
}

/* ─── Action Log Strip ─── */

function ActionLogStrip({
  lines,
  actionBusy,
  lastTaskEvent,
}: {
  lines: ConsoleLine[];
  actionBusy: ProjectAction | null;
  lastTaskEvent: import('@dst-launcher/shared').TaskEvent | null;
}) {
  const [visible, setVisible] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const isTaskActive = lastTaskEvent !== null && (lastTaskEvent.type === 'task.started' || lastTaskEvent.type === 'task.progress');
  const showStrip = !dismissed && (actionBusy !== null || isTaskActive);

  useEffect(() => {
    if (showStrip) {
      setVisible(true);
      setDismissed(false);
    }
  }, [showStrip]);

  useEffect(() => {
    if (!isTaskActive && actionBusy === null && visible) {
      const timer = setTimeout(() => setVisible(false), 8000);
      return () => clearTimeout(timer);
    }
  }, [isTaskActive, actionBusy, visible]);

  useEffect(() => {
    if (actionBusy !== null) setDismissed(false);
  }, [actionBusy]);

  useEffect(() => {
    const node = containerRef.current;
    if (node) node.scrollTo({ top: node.scrollHeight, behavior: 'smooth' });
  }, [lines.length]);

  if (!visible) return null;

  const recentLines = lines.slice(-8);
  const label = actionBusy
    ? `正在${actionLabels[actionBusy]}...`
    : lastTaskEvent?.type === 'task.finished'
      ? '操作完成'
      : lastTaskEvent?.type === 'task.failed'
        ? '操作失败'
        : '处理中...';

  const iconNode = actionBusy || isTaskActive
    ? <LoaderCircle className="size-3.5 animate-spin text-primary" />
    : lastTaskEvent?.type === 'task.finished'
      ? <CheckCircle2 className="size-3.5 text-success" />
      : <AlertTriangle className="size-3.5 text-danger" />;

  return (
    <div className="border-t border-border bg-console">
      <div className="flex items-center justify-between gap-3 px-4 py-2.5">
        <div className="flex items-center gap-2 text-sm font-medium text-foreground">
          {iconNode}
          {label}
        </div>
        <button type="button" onClick={() => { setDismissed(true); setVisible(false); }} className="text-muted-foreground transition hover:text-foreground">
          <X className="size-4" />
        </button>
      </div>
      <div ref={containerRef} className="max-h-36 overflow-auto px-4 pb-3 font-mono text-[11px] leading-5 text-slate-300">
        {recentLines.map((line) => (
          <div key={line.id} className="flex gap-3 border-b border-white/5 py-1 last:border-b-0">
            <span className="shrink-0 text-slate-500">{new Date(line.timestamp).toLocaleTimeString()}</span>
            <span className={logSourceColor(line.source)}>[{line.source}]</span>
            <span className="whitespace-pre-wrap break-words">{line.message}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─── Boot Status Banner ─── */

type Milestone = {
  id: string;
  label: string;
  status: 'done' | 'active' | 'error';
  detail?: string;
};

function extractBootMilestones(lines: ConsoleLine[]): Milestone[] {
  const text = lines.map((l) => l.message).join('\n');
  const milestones: Milestone[] = [];

  // steamcmd download progress
  const downloadMatches = text.match(/progress: (\d+\.?\d*)/g);
  if (downloadMatches) {
    const lastPct = downloadMatches[downloadMatches.length - 1]?.match(/(\d+\.?\d*)/)?.[1];
    const isDone = Number(lastPct) >= 99.9 || /fully installed/i.test(text);
    milestones.push({
      id: 'download',
      label: isDone ? '游戏文件已就绪' : '下载游戏文件',
      status: isDone ? 'done' : 'active',
      detail: isDone ? undefined : `${Math.floor(Number(lastPct ?? 0))}%`,
    });
  }

  // World loading
  const hasLoadBeDone = /LOAD BE: done/.test(text);
  const hasLoadBe = /LOAD BE/.test(text);
  if (hasLoadBe) {
    milestones.push({
      id: 'load-be',
      label: '加载世界',
      status: hasLoadBeDone ? 'done' : 'active',
    });
  }

  // Caves shard
  const cavesConnected = /\[Shard\] .* connected/i.test(text);
  const cavesWaiting = /Secondary shard is waiting for LUA/.test(text);
  const cavesSkipped = /Skipping portal.*no available shard.*Caves.*connected/i.test(text);
  if (cavesWaiting || cavesConnected) {
    milestones.push({
      id: 'caves',
      label: '洞穴 Shard 连接',
      status: cavesConnected ? 'done' : 'active',
    });
  } else if (cavesSkipped) {
    milestones.push({
      id: 'caves',
      label: '洞穴 Shard 未连接',
      status: 'error',
      detail: '主世界跳过了洞穴入口，洞穴容器可能未启动或连接超时。',
    });
  }

  // Klei registration
  const regMatch = text.match(/Server registered via geo DNS in (.+)/);
  if (regMatch) {
    const region = regMatch[1]?.trim() ?? '';
    milestones.push({
      id: 'registered',
      label: '注册到 Klei 大厅',
      status: 'done',
      detail: region,
    });
  }

  // Server ready
  if (/Sim paused/.test(text)) {
    milestones.push({
      id: 'ready',
      label: '服务器就绪，等待玩家',
      status: 'done',
    });
  }

  // Errors — capture the actual error message for display
  const errorPatterns = [
    /Error loading main\.lua/,
    /Error during game initialization/,
    /SOCKET_PORT_ALREADY_IN_USE/,
    /assert failure/i,
    /LUA ERROR/i,
    /Shutting down$/m,
  ];
  for (const pattern of errorPatterns) {
    const match = text.match(pattern);
    if (match) {
      milestones.push({
        id: 'error',
        label: '运行异常',
        status: 'error',
        detail: match[0],
      });
      break;
    }
  }

  return milestones;
}

/** Extract recent stderr lines for diagnostic display */
function extractRecentErrors(lines: ConsoleLine[], max = 3): string[] {
  return lines
    .filter((l) => l.source === 'stderr')
    .slice(-max)
    .map((l) => l.message);
}

function BootStatusBanner({ lines, project }: { lines: ConsoleLine[]; project: ProjectDetail }) {
  const milestones = useMemo(() => extractBootMilestones(lines), [lines]);
  const recentErrors = useMemo(() => extractRecentErrors(lines), [lines]);

  // Container diagnostics
  const stoppedContainers = project.runtime.containers.filter((c) => c.state !== 'running');
  const crashLooping = stoppedContainers.some((c) => /exited/i.test(c.state) || /restarting/i.test(c.state));

  // Determine overall status
  const hasError = milestones.some((m) => m.status === 'error');
  const hasActive = milestones.some((m) => m.status === 'active');
  const allDone = milestones.length > 0 && milestones.every((m) => m.status === 'done');
  const isRunning = project.runtime.containers.some((c) => c.state === 'running');

  // Status summary for the banner
  let bannerTone: 'success' | 'active' | 'error' | 'idle';
  let bannerTitle: string;
  let bannerDetail: string;
  let regionNote = '';

  if (hasError) {
    bannerTone = 'error';
    const errMilestone = milestones.find((m) => m.status === 'error');
    bannerTitle = '启动异常';
    bannerDetail = errMilestone?.detail ?? errMilestone?.label ?? '请查看控制台获取详情。';
  } else if (crashLooping && !isRunning) {
    bannerTone = 'error';
    bannerTitle = '容器异常退出';
    const names = stoppedContainers.map((c) => `${c.service} (${c.state})`).join(', ');
    bannerDetail = `以下容器未正常运行：${names}。请查看控制台日志排查原因。`;
  } else if (hasActive) {
    bannerTone = 'active';
    const activeItem = milestones.find((m) => m.status === 'active');
    bannerTitle = activeItem?.label ?? '正在处理...';
    bannerDetail = activeItem?.detail ?? '请稍候，进度会实时更新。';
  } else if (allDone && isRunning) {
    bannerTone = 'success';
    const region = milestones.find((m) => m.id === 'registered')?.detail;
    bannerTitle = '服务器在线';
    bannerDetail = region
      ? `已注册到 Klei 大厅 (${region})，可在游戏内搜索加入。`
      : '服务器已就绪，等待玩家加入。';
    if (region) {
      regionNote = `服务器注册在 ${region} 区域。游戏内搜索默认只显示你所在区域的服务器，跨区域玩家需要在搜索筛选中切换到对应区域才能找到。`;
    }
  } else if (isRunning) {
    bannerTone = 'active';
    bannerTitle = '容器运行中';
    bannerDetail = '等待日志推送，如果长时间无进度请查看控制台。';
  } else if (!project.runtime.dockerAvailable) {
    bannerTone = 'error';
    bannerTitle = project.target.type === 'native' ? '服务端未安装' : 'Docker 不可用';
    bannerDetail = project.target.type === 'native'
      ? '请先点击「安装/更新服务器」下载 DST 服务端。'
      : '无法连接到 Docker，请检查目标配置和 Docker 服务状态。';
  } else if (project.runtime.containers.length === 0) {
    bannerTone = 'idle';
    bannerTitle = '未运行';
    bannerDetail = '点击「启动」或「部署」开始运行服务器。';
  } else {
    bannerTone = 'idle';
    bannerTitle = '容器已停止';
    bannerDetail = '点击「启动」恢复运行。';
  }

  const toneStyles = {
    success: 'border-success/25 bg-success/10',
    active: 'border-primary/25 bg-primary/10',
    error: 'border-danger/25 bg-danger/10',
    idle: 'border-border bg-inset/60',
  }[bannerTone];

  const iconNode = {
    success: <CheckCircle2 className="size-5 shrink-0 text-success" />,
    active: <LoaderCircle className="size-5 shrink-0 animate-spin text-primary" />,
    error: <AlertTriangle className="size-5 shrink-0 text-danger" />,
    idle: <div className="size-5 shrink-0 rounded-full border-2 border-muted-foreground/30" />,
  }[bannerTone];

  return (
    <div className={`rounded-2xl border p-4 ${toneStyles}`}>
      <div className="flex items-start gap-3">
        {iconNode}
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold text-foreground">{bannerTitle}</div>
          <div className="mt-0.5 text-sm text-muted-foreground">{bannerDetail}</div>

          {/* Region note for cross-region search */}
          {regionNote && (
            <div className="mt-2 rounded-xl border border-warning/20 bg-warning/5 px-3 py-2 text-xs leading-5 text-warning">
              {regionNote}
            </div>
          )}

          {/* Download progress bar */}
          {milestones.some((m) => m.id === 'download' && m.status === 'active') && (() => {
            const dl = milestones.find((m) => m.id === 'download');
            const pct = dl?.detail ? parseInt(dl.detail, 10) : 0;
            return (
              <div className="mt-3">
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>下载进度</span>
                  <span className="font-mono">{pct}%</span>
                </div>
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-white/10">
                  <div className="h-full rounded-full bg-primary transition-all duration-500" style={{ width: `${pct}%` }} />
                </div>
              </div>
            );
          })()}

          {/* Milestone steps (when there's meaningful progress) */}
          {milestones.length > 1 && (
            <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1">
              {milestones.map((m) => (
                <div key={m.id} className="flex items-center gap-1.5 text-xs">
                  {m.status === 'done' && <CheckCircle2 className="size-3 text-success" />}
                  {m.status === 'active' && <LoaderCircle className="size-3 animate-spin text-primary" />}
                  {m.status === 'error' && <AlertTriangle className="size-3 text-danger" />}
                  <span className={m.status === 'done' ? 'text-muted-foreground' : m.status === 'error' ? 'text-danger' : 'text-foreground'}>
                    {m.label}
                  </span>
                  {m.detail && m.id !== 'error' && <span className="font-mono text-muted-foreground">{m.detail}</span>}
                </div>
              ))}
            </div>
          )}

          {/* Recent stderr errors — only in error state */}
          {bannerTone === 'error' && recentErrors.length > 0 && (
            <div className="mt-3 space-y-1 rounded-xl border border-danger/15 bg-danger/5 px-3 py-2 font-mono text-[11px] leading-5 text-danger/90">
              {recentErrors.map((msg, i) => (
                <div key={i} className="truncate">{msg}</div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ─── Shared helpers ─── */

function logSourceColor(source: ConsoleLine['source']) {
  switch (source) {
    case 'stderr': return 'text-rose-400';
    case 'stdout': return 'text-emerald-400';
    case 'task': return 'text-sky-400';
    default: return 'text-amber-300';
  }
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
  const isNative = project.target.type === 'native';
  const entityLabel = isNative ? '进程' : '容器';
  return (
    <Card>
      <CardHeader>
        <CardTitle>运行检查</CardTitle>
        <CardDescription>{isNative ? '服务端、部署目录和进程状态。' : 'Docker、部署目录和容器状态。'}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <ChecklistRow
          label={isNative ? '服务端' : 'Docker'}
          value={project.runtime.dockerAvailable ? (isNative ? '已安装' : '已连接') : (isNative ? '未安装' : '不可用')}
          tone={project.runtime.dockerAvailable ? 'success' : 'warning'}
        />
        <ChecklistRow label="部署目录" value={project.deployment?.targetPath ?? '尚未部署'} tone={project.deployment?.targetPath ? 'neutral' : 'warning'} copyValue={project.deployment?.targetPath ?? undefined} />
        <ChecklistRow label="最近部署" value={formatDateTime(project.deployment?.lastDeployedAt ?? null)} tone="neutral" />

        <div className="space-y-3">
          {project.runtime.containers.length === 0 ? (
            <div className="rounded-2xl border border-border bg-inset/60 p-4 text-sm text-muted-foreground">当前没有活跃{entityLabel}。</div>
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

  return (
    <Card data-testid="workspace-network-panel">
      <CardHeader>
        <CardTitle>网络 / 放通</CardTitle>
        <CardDescription>看端口是否真的对外可达。</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className={`rounded-2xl border p-4 ${statusTone.panel}`}>
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-2 text-sm font-medium text-foreground">
              {statusTone.icon === 'warning' ? <AlertTriangle className="size-4" /> : <ShieldCheck className="size-4" />}
              <span data-testid="workspace-network-status">{getNetworkHeading(network, project.target.type)}</span>
            </div>
            <div className={`shrink-0 rounded-full border px-3 py-1 text-[11px] tracking-[0.14em] ${statusTone.badge}`}>
              {getNetworkStatusLabel(network.status)}
            </div>
          </div>
          {network.detail ? <p className="mt-2 text-sm leading-6 text-muted-foreground">{network.detail}</p> : null}
        </div>

        <ChecklistRow label="Docker UDP 映射" value={`${network.requiredUdpPorts.length} 个端口`} tone="neutral" />
        <ChecklistRow label="主机防火墙" value={describeFirewallProvider(network)} tone={network.firewallSupported ? 'success' : 'warning'} />

        <PortRow label="所需 UDP 端口" ports={network.requiredUdpPorts} tone="neutral" />
        <PortRow label="已放通" ports={network.openUdpPorts} tone="success" emptyText="当前还没有检测到已放通的 UDP 端口。" />
        <PortRow label="缺失" ports={network.missingUdpPorts} tone="warning" emptyText="当前没有缺失端口。" />

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

function getNetworkTone(status: ProjectNetwork['status']) {
  switch (status) {
    case 'ready': return { icon: 'success' as const, panel: 'border-success/25 bg-success/10', badge: 'border-success/25 bg-success/10 text-success' };
    case 'not_applicable': return { icon: 'success' as const, panel: 'border-border bg-inset/60', badge: 'border-border bg-inset text-muted-foreground' };
    case 'needs_attention': return { icon: 'warning' as const, panel: 'border-warning/25 bg-warning/10', badge: 'border-warning/25 bg-warning/10 text-warning' };
    case 'unsupported':
    case 'unknown': return { icon: 'warning' as const, panel: 'border-danger/25 bg-danger/10', badge: 'border-danger/25 bg-danger/10 text-danger' };
  }
}

function getNetworkStatusLabel(status: ProjectNetwork['status']) {
  switch (status) {
    case 'ready': return '已放通';
    case 'not_applicable': return '本地模式';
    case 'needs_attention': return '待处理';
    case 'unsupported': return '不支持自动处理';
    case 'unknown': return '状态未知';
  }
}

function getNetworkHeading(network: ProjectNetwork, targetType: ProjectDetail['target']['type']) {
  if (targetType === 'local' || targetType === 'native') return '本地模式无需额外开放 VPS UDP 端口';
  if (network.status === 'ready') return '远端主机 UDP 端口已准备完成';
  if (network.status === 'needs_attention') return '远端主机仍有 UDP 端口未放通';
  if (network.status === 'unsupported') return '当前目标未检测到可自动管理的防火墙';
  return '远端网络状态需要进一步确认';
}

function describeFirewallProvider(network: ProjectNetwork) {
  if (network.firewallProvider === 'ufw') return network.firewallSupported ? 'UFW（可自动处理）' : 'UFW';
  if (network.firewallProvider === 'none') return '不适用';
  return network.firewallSupported ? '可检测，待识别' : '暂不支持自动处理';
}

function TunnelPanel({
  project,
  busyStart,
  busyStop,
  onStart,
  onStop,
}: {
  project: ProjectDetail;
  busyStart: boolean;
  busyStop: boolean;
  onStart: () => void;
  onStop: () => void;
}) {
  const tunnel = project.tunnel;
  const isActive = tunnel?.active ?? false;
  const hasClaimUrl = !!tunnel?.error?.includes('playit.gg/claim');
  const needsSetup = !!tunnel?.error?.includes('playit.gg/account/agents');
  const publicAddr = tunnel?.publicHost
    ? `${tunnel.publicHost}${tunnel.portMappings?.[0]?.publicPort ? `:${tunnel.portMappings[0].publicPort}` : ''}`
    : '';

  const claimUrl = tunnel?.error?.match(/https:\/\/playit\.gg\/claim\/\S+/)?.[0] ?? '';
  const agentUrl = tunnel?.error?.match(/https:\/\/playit\.gg\/account\/agents\/\S+/)?.[0] ?? '';

  // Extract unique UDP ports from cluster config for setup guidance
  const cc = project.clusterConfig;
  const requiredUdpPorts = [...new Set([
    cc.master.serverPort,
    cc.master.masterServerPort,
    cc.master.authenticationPort,
    cc.caves.serverPort,
    cc.caves.masterServerPort,
    cc.caves.authenticationPort,
  ])];

  return (
    <Card data-testid="workspace-tunnel-panel">
      <CardHeader>
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Globe className="size-4" />
              NAT 穿透
            </CardTitle>
            <CardDescription>
              通过 playit.gg 让 NAT 后的本地服务器可被外部玩家访问。
            </CardDescription>
          </div>
          <div className="flex gap-2">
            {!isActive ? (
              <Button variant="primary" disabled={busyStart} onClick={onStart}>
                <Play className="size-4" />
                {busyStart ? '启动中...' : '启动穿透'}
              </Button>
            ) : (
              <Button variant="secondary" disabled={busyStop} onClick={onStop}>
                <Power className="size-4" />
                {busyStop ? '停止中...' : '停止穿透'}
              </Button>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Status indicator */}
        <div className={`rounded-2xl border p-4 ${
          isActive
            ? 'border-success/25 bg-success/10'
            : hasClaimUrl || needsSetup
              ? 'border-warning/25 bg-warning/10'
              : 'border-border bg-inset/60'
        }`}>
          <div className="flex items-center gap-2 text-sm font-medium text-foreground">
            {isActive ? (
              <>
                <CheckCircle2 className="size-4 text-success" />
                隧道已建立
              </>
            ) : hasClaimUrl ? (
              <>
                <AlertTriangle className="size-4 text-warning" />
                需要认证
              </>
            ) : needsSetup ? (
              <>
                <AlertTriangle className="size-4 text-warning" />
                需要配置隧道
              </>
            ) : (
              <>
                <div className="size-4 rounded-full border-2 border-muted-foreground/30" />
                未启动
              </>
            )}
          </div>
          {tunnel?.error && !isActive && (
            <p className="mt-2 text-sm text-muted-foreground">{tunnel.error}</p>
          )}
        </div>

        {/* Step-by-step setup guide — shown when not active */}
        {!isActive && !hasClaimUrl && !needsSetup && (
          <div className="rounded-2xl border border-border bg-inset/60 p-4 space-y-3">
            <div className="text-sm font-medium text-foreground">使用指南</div>
            <ol className="list-inside list-decimal space-y-2 text-sm text-muted-foreground">
              <li>点击上方「启动穿透」按钮，playit.gg 客户端将自动启动</li>
              <li>首次使用会弹出认证链接，在浏览器中打开并注册/登录 playit.gg 账号（免费）</li>
              <li>
                认证完成后，前往 playit.gg 控制台为以下端口各添加一条 <strong className="text-foreground">UDP 隧道</strong>：
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {requiredUdpPorts.map((port) => (
                    <span key={port} className="rounded-full border border-primary/25 bg-primary/10 px-2.5 py-0.5 font-mono text-xs text-primary">
                      {port}/udp
                    </span>
                  ))}
                </div>
              </li>
              <li>隧道建立后，此处会显示公网地址，玩家即可通过该地址加入游戏</li>
            </ol>
            <p className="text-xs text-muted-foreground/70">playit.gg 免费计划即可满足 DST 服务器使用，无需付费。</p>
          </div>
        )}

        {/* Claim URL — needs browser authentication */}
        {hasClaimUrl && claimUrl && (
          <div className="rounded-2xl border border-warning/20 bg-warning/5 p-4 space-y-3">
            <div className="text-sm font-medium text-foreground">步骤 1/3：完成认证</div>
            <p className="text-sm text-muted-foreground">请在浏览器中打开以下链接，注册或登录 playit.gg 账号并绑定本机 Agent。认证完成后隧道会自动继续。</p>
            <a
              href={claimUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-xl border border-primary/30 bg-primary/10 px-3 py-2 text-sm font-medium text-primary transition hover:bg-primary/20"
            >
              <ExternalLink className="size-3.5" />
              打开认证页面
            </a>
          </div>
        )}

        {/* Agent URL — needs tunnel configuration */}
        {needsSetup && agentUrl && (
          <div className="rounded-2xl border border-warning/20 bg-warning/5 p-4 space-y-3">
            <div className="text-sm font-medium text-foreground">步骤 2/3：添加 UDP 隧道</div>
            <p className="text-sm text-muted-foreground">Agent 已认证成功。现在需要在 playit.gg 控制台中添加 UDP 隧道，每个端口添加一条：</p>
            <div className="flex flex-wrap gap-1.5">
              {requiredUdpPorts.map((port) => (
                <span key={port} className="rounded-full border border-warning/30 bg-warning/10 px-2.5 py-0.5 font-mono text-xs text-warning">
                  {port}/udp
                </span>
              ))}
            </div>
            <details className="text-sm text-muted-foreground">
              <summary className="cursor-pointer font-medium text-foreground hover:text-primary">操作步骤</summary>
              <ol className="mt-2 list-inside list-decimal space-y-1 pl-1">
                <li>打开下方链接进入 Agent 配置页面</li>
                <li>点击「Add Tunnel」按钮</li>
                <li>类型选择 <strong className="text-foreground">UDP</strong></li>
                <li>Local Port 填写上述端口号（每个端口添加一条）</li>
                <li>保存后等待几秒，隧道会自动生效</li>
              </ol>
            </details>
            <a
              href={agentUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-xl border border-primary/30 bg-primary/10 px-3 py-2 text-sm font-medium text-primary transition hover:bg-primary/20"
            >
              <ExternalLink className="size-3.5" />
              打开 Agent 配置页面
            </a>
          </div>
        )}

        {/* Public address display */}
        {isActive && publicAddr && (
          <div className="rounded-2xl border border-success/20 bg-success/5 p-4">
            <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">公网地址</div>
            <div className="mt-2 flex items-center justify-between gap-3">
              <span className="break-all font-mono text-lg font-semibold text-foreground">{publicAddr}</span>
              <CopyButton value={publicAddr} label="复制" />
            </div>
            {tunnel?.portMappings && tunnel.portMappings.length > 0 && (
              <div className="mt-3 space-y-1">
                <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">端口映射</div>
                <div className="mt-1 flex flex-wrap gap-2">
                  {tunnel.portMappings.map((m) => (
                    <span
                      key={`${m.localPort}-${m.publicPort}`}
                      className="rounded-full border border-success/25 bg-success/10 px-3 py-1 font-mono text-[12px] text-success"
                    >
                      :{m.publicPort} → :{m.localPort}/udp
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Usage hint */}
        {isActive && publicAddr && (
          <div className="rounded-xl border border-border bg-inset/50 px-4 py-3 text-sm text-muted-foreground">
            玩家在游戏内「浏览游戏」搜索你的服务器名称即可加入。如果搜索不到，可以尝试通过控制台命令 <code className="font-mono text-xs">c_connect("{publicAddr.split(':')[0]}", {publicAddr.split(':')[1]})</code> 直连。
          </div>
        )}
      </CardContent>
    </Card>
  );
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

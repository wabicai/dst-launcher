'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import useSWR from 'swr';
import { ArrowRight, FolderKanban, Rocket, Server, Waypoints } from 'lucide-react';
import { getApiClient } from '@/lib/api';
import { formatDateTime } from '@/lib/format';
import type { ProjectSummary } from '@dst-launcher/shared';
import { StatusBadge } from '@/components/status-badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';


export default function HomePage() {
  const client = useMemo(() => getApiClient(), []);
  const { data, error, isLoading } = useSWR('projects', () => client.getProjects(), {
    refreshInterval: 5000,
  });

  const projects = useMemo(() => {
    return [...(data ?? [])].sort((left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime());
  }, [data]);

  const remoteCount = projects.filter((project) => project.targetType === 'ssh').length;
  const deployedCount = projects.filter((project) => project.lastDeploymentAt).length;

  return (
    <main className="space-y-4">
      <section className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight text-foreground">项目</h2>
          <p className="mt-1 text-sm text-muted-foreground">继续处理现有集群，或者新建一个新的工作区。</p>
        </div>
        <Link href="/projects/new">
          <Button>
            <Rocket className="size-4" />
            新建项目
          </Button>
        </Link>
      </section>

      <section className="grid gap-3 md:grid-cols-3">
        <MetricCard label="全部项目" value={String(projects.length)} icon={FolderKanban} />
        <MetricCard label="远程目标" value={String(remoteCount)} icon={Waypoints} />
        <MetricCard label="已有部署" value={String(deployedCount)} icon={Server} />
      </section>

      {projects.length === 0 && !isLoading && !error ? (
        <section className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_320px]">
          <Card data-testid="home-project-list">
            <CardHeader>
              <CardTitle>还没有项目</CardTitle>
              <CardDescription>先创建一个本地或远程的 DST 集群，首页之后就会直接变成你的持续工作入口。</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-2xl border border-border bg-inset/60 p-5">
                <div className="text-sm font-medium text-foreground">推荐顺序</div>
                <div className="mt-3 grid gap-3 md:grid-cols-3">
                  <StepCard index="01" title="选目标" detail="先决定本地调试还是远程 VPS。" />
                  <StepCard index="02" title="填房间" detail="项目名、玩家数、Token 一次填完。" />
                  <StepCard index="03" title="看预览" detail="确认端口、目录和配置文件输出。" />
                </div>
              </div>
              <div className="flex flex-wrap gap-3">
                <Link href="/projects/new">
                  <Button>
                    <Rocket className="size-4" />
                    去创建
                  </Button>
                </Link>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>上线前先看这两点</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-muted-foreground">
              <HintRow title="远程服优先用 SSH 模式">避免本机休眠让房间离线。</HintRow>
              <HintRow title="部署后还要看 UDP 放通">Compose 映射只是一半，主机防火墙和云侧规则也要对。 </HintRow>
            </CardContent>
          </Card>
        </section>
      ) : null}

      {projects.length > 0 || isLoading || error ? (
        <section>
          <Card data-testid="home-project-list">
            <CardHeader className="border-b border-border">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <CardTitle>项目列表</CardTitle>
                  <CardDescription>按最近更新时间排序。</CardDescription>
                </div>
                <div data-visual-dynamic="project-list" className="rounded-full border border-border bg-inset px-3 py-1 font-mono text-[11px] text-muted-foreground">
                  {projects.length} entries
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {isLoading ? <ListState title="正在加载项目列表..." /> : null}
              {error ? <ListState title={error instanceof Error ? error.message : '加载失败'} danger /> : null}
              {!isLoading && !error ? (
                <div data-visual-dynamic="project-list" className="divide-y divide-border">
                  <div className="hidden grid-cols-[minmax(0,1.35fr)_120px_100px_120px_120px_110px] gap-3 px-5 py-3 text-[11px] uppercase tracking-[0.16em] text-muted-foreground xl:grid">
                    <span>项目</span>
                    <span>状态</span>
                    <span>目标</span>
                    <span>更新</span>
                    <span>部署</span>
                    <span>动作</span>
                  </div>
                  {projects.map((project) => (
                    <ProjectListRow key={project.id} project={project} />
                  ))}
                </div>
              ) : null}
            </CardContent>
          </Card>
        </section>
      ) : null}
    </main>
  );
}

function ProjectListRow({ project }: { project: ProjectSummary }) {
  return (
    <Link href={`/project?id=${project.id}`} className="group block border-l-2 border-transparent transition hover:border-[hsl(var(--primary)/0.35)] hover:bg-white/[0.015]">
      <div className="grid gap-3 px-5 py-4 xl:grid-cols-[minmax(0,1.35fr)_120px_100px_120px_120px_110px] xl:items-center">
        <div className="min-w-0">
          <div className="truncate text-sm font-medium text-foreground">{project.name}</div>
          <div className="mt-2 font-mono text-[12px] text-muted-foreground">{project.slug}</div>
          <p className="mt-2 truncate text-sm text-muted-foreground">{project.description || '—'}</p>
        </div>

        <div className="flex items-center gap-3 xl:block">
          <span className="text-xs text-muted-foreground xl:hidden">状态</span>
          <StatusBadge status={project.status} />
        </div>

        <MetricColumn label="目标" value={project.targetType === 'local' ? 'local' : 'ssh'} />
        <MetricColumn label="更新" value={formatDateTime(project.updatedAt)} dynamic />
        <MetricColumn label="部署" value={formatDateTime(project.lastDeploymentAt)} dynamic />

        <div className="flex items-center justify-between gap-3 xl:justify-end">
          <span className="text-xs text-muted-foreground xl:hidden">动作</span>
          <span className="inline-flex items-center gap-2 text-sm text-foreground transition group-hover:translate-x-0.5">
            打开
            <ArrowRight className="size-4" />
          </span>
        </div>
      </div>
    </Link>
  );
}

function MetricCard({ label, value, icon: Icon }: { label: string; value: string; icon: typeof FolderKanban }) {
  return (
    <div className="rounded-2xl border border-border bg-panel/90 px-4 py-4 shadow-panel">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-xs text-muted-foreground">{label}</div>
          <div data-visual-dynamic="summary" className="mt-2 text-2xl font-semibold text-foreground">
            {value}
          </div>
        </div>
        <span className="inline-flex size-10 items-center justify-center rounded-xl border border-border bg-inset text-primary">
          <Icon className="size-4" />
        </span>
      </div>
    </div>
  );
}

function MetricColumn({ label, value, dynamic = false }: { label: string; value: string; dynamic?: boolean }) {
  return (
    <div data-visual-dynamic={dynamic ? 'time' : undefined} className="flex items-center justify-between gap-3 xl:block">
      <span className="text-xs text-muted-foreground xl:hidden">{label}</span>
      <div className="font-mono text-[13px] text-foreground">{value}</div>
    </div>
  );
}

function StepCard({ index, title, detail }: { index: string; title: string; detail: string }) {
  return (
    <div className="rounded-xl border border-border bg-panel px-4 py-4">
      <div className="flex items-center gap-2">
        <span className="rounded-full border border-border bg-inset px-2 py-1 font-mono text-[11px] text-muted-foreground">{index}</span>
        <span className="text-sm font-medium text-foreground">{title}</span>
      </div>
      <p className="mt-2 text-sm text-muted-foreground">{detail}</p>
    </div>
  );
}

function HintRow({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-inset/60 p-4">
      <div className="text-sm font-medium text-foreground">{title}</div>
      <p className="mt-1 text-sm leading-6 text-muted-foreground">{children}</p>
    </div>
  );
}

function ListState({ title, danger = false }: { title: string; danger?: boolean }) {
  return (
    <div className={`m-5 rounded-2xl border px-5 py-6 text-sm ${danger ? 'border-danger/20 bg-danger/10 text-danger' : 'border-border bg-inset/70 text-muted-foreground'}`}>
      {title}
    </div>
  );
}

'use client';

import useSWR from 'swr';
import { ArrowRight, Plus, Server, Waypoints } from 'lucide-react';
import { getApiClient } from '@/lib/api';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/status-badge';

export default function HomePage() {
  const client = getApiClient();
  const { data, error, isLoading } = useSWR('projects', () => client.getProjects(), {
    refreshInterval: 5000,
  });

  return (
    <main className="space-y-8">
      <section className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <Card className="overflow-hidden">
          <CardContent className="relative p-8 md:p-10">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(255,176,55,0.16),transparent_32%),radial-gradient(circle_at_bottom_right,rgba(59,202,230,0.16),transparent_28%)]" />
            <div className="relative space-y-5">
              <span className="inline-flex items-center rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs uppercase tracking-[0.22em] text-amber-300">DST Launcher / Electron V1</span>
              <h1 className="max-w-3xl font-display text-4xl leading-tight text-foreground md:text-6xl">把《饥荒联机版》开服流程，压缩成可复用、可预览、可诊断的桌面控制台。</h1>
              <p className="max-w-2xl text-base leading-7 text-muted-foreground md:text-lg">
                本地模式管理 Docker Desktop，远程模式通过 SSH 控制 VPS Docker。配置预览、部署、日志、备份和端口检查都围绕一个项目模型收敛。
              </p>
              <div className="flex flex-wrap gap-3">
                <a href="/projects/new">
                  <Button>
                    <Plus className="mr-2 size-4" />
                    新建项目
                  </Button>
                </a>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="grid gap-6">
          <Card>
            <CardHeader>
              <CardTitle>设计原则</CardTitle>
              <CardDescription>第一版优先解决个人开发者最痛的操作密度：部署、重启、日志和错误定位。</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 text-sm text-muted-foreground">
              <Metric icon={Server} title="本地完整链路" description="Next UI + Electron + sidecar + Docker Compose 在单机上串起来。" />
              <Metric icon={Waypoints} title="远程基础链路" description="SSH 登录 VPS，拉配置、执行 Docker Compose、查看日志。" />
            </CardContent>
          </Card>
        </div>
      </section>

      <section>
        <div className="mb-5 flex items-center justify-between">
          <div>
            <h2 className="font-display text-2xl">项目列表</h2>
            <p className="mt-1 text-sm text-muted-foreground">这里展示本地数据库中的所有 DST 项目与最近运行态。</p>
          </div>
          <a href="/projects/new">
            <Button variant="secondary">
              <Plus className="mr-2 size-4" />
              新建
            </Button>
          </a>
        </div>

        {isLoading ? <EmptyCard title="正在加载项目..." /> : null}
        {error ? <EmptyCard title={error instanceof Error ? error.message : '加载失败'} danger /> : null}
        {!isLoading && !error && data?.length === 0 ? <EmptyCard title="还没有项目，先创建一个新的 DST 集群吧。" /> : null}

        <div className="grid gap-5 xl:grid-cols-2">
          {data?.map((project: NonNullable<typeof data>[number]) => (
            <Card key={project.id} className="group">
              <CardHeader>
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <CardTitle>{project.name}</CardTitle>
                    <CardDescription className="mt-2">{project.description || '暂无说明'} · `{project.slug}`</CardDescription>
                  </div>
                  <StatusBadge status={project.status} />
                </div>
              </CardHeader>
              <CardContent className="space-y-4 text-sm text-muted-foreground">
                <div>目标：{project.targetType === 'local' ? '本地 Docker Desktop' : '远程 SSH Docker'}</div>
                <div>最近更新时间：{new Date(project.updatedAt).toLocaleString()}</div>
                <div>最近部署：{project.lastDeploymentAt ? new Date(project.lastDeploymentAt).toLocaleString() : '尚未部署'}</div>
                <a href={`/project?id=${project.id}`} className="inline-flex items-center text-primary transition group-hover:translate-x-1">
                  打开工作区
                  <ArrowRight className="ml-2 size-4" />
                </a>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>
    </main>
  );
}

function Metric({ icon: Icon, title, description }: { icon: typeof Server; title: string; description: string }) {
  return (
    <div className="rounded-2xl border border-border bg-card/40 p-4">
      <div className="mb-3 inline-flex rounded-2xl border border-white/10 bg-white/5 p-3 text-primary">
        <Icon className="size-5" />
      </div>
      <div className="font-medium text-foreground">{title}</div>
      <p className="mt-2 leading-6">{description}</p>
    </div>
  );
}

function EmptyCard({ title, danger = false }: { title: string; danger?: boolean }) {
  return (
    <div className={`rounded-3xl border p-8 text-sm ${danger ? 'border-danger/30 bg-danger/10 text-danger' : 'border-border bg-card/50 text-muted-foreground'}`}>
      {title}
    </div>
  );
}

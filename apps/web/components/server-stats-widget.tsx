'use client';

import { useMemo } from 'react';
import useSWR from 'swr';
import { Activity, HardDrive, MemoryStick, RefreshCw } from 'lucide-react';
import type { ServerStats } from '@dst-launcher/shared';
import { getApiClient } from '@/lib/api';

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
}

function UsageBar({ used, total, colorClass = 'bg-primary' }: { used: number; total: number; colorClass?: string }) {
  const pct = total > 0 ? Math.min(100, Math.round((used / total) * 100)) : 0;
  const barColor = pct > 90 ? 'bg-danger' : pct > 70 ? 'bg-warning' : colorClass;
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-border">
        <div className={`h-full rounded-full transition-all ${barColor}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="w-8 text-right font-mono text-[10px] text-muted-foreground">{pct}%</span>
    </div>
  );
}

export function ServerStatsWidget({ projectId }: { projectId: string }) {
  const client = useMemo(() => getApiClient(), []);
  const { data, error, isLoading, mutate } = useSWR<ServerStats>(
    ['project-stats', projectId],
    () => client.getProjectStats(projectId),
    { refreshInterval: 15_000, errorRetryCount: 2 },
  );

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-border bg-inset/60 px-3 py-2 text-xs text-muted-foreground">
        <Activity className="size-3.5 animate-pulse" />
        正在获取服务器状态...
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex items-center justify-between gap-3 rounded-xl border border-border bg-inset/60 px-3 py-2 text-xs text-muted-foreground">
        <span>服务器状态不可用</span>
        <button type="button" onClick={() => void mutate()} className="text-muted-foreground transition hover:text-foreground">
          <RefreshCw className="size-3.5" />
        </button>
      </div>
    );
  }

  const hasSwap = data.swap.total > 0;

  return (
    <div className="rounded-2xl border border-border bg-panel/88 p-4 shadow-panel">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-xs font-medium text-foreground">
          <Activity className="size-3.5 text-primary" />
          服务器资源
        </div>
        <button
          type="button"
          onClick={() => void mutate()}
          className="text-muted-foreground transition hover:text-foreground"
          title="刷新"
        >
          <RefreshCw className="size-3.5" />
        </button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {/* CPU */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
              <Activity className="size-3" />
              CPU 负载
            </div>
            <span className="font-mono text-[11px] text-foreground">
              {data.cpu.cpuCount > 0
                ? `${Math.min(100, Math.round((data.cpu.loadAvg1 / data.cpu.cpuCount) * 100))}%`
                : data.cpu.loadAvg1.toFixed(2)}
            </span>
          </div>
          <UsageBar used={data.cpu.loadAvg1} total={data.cpu.cpuCount > 0 ? data.cpu.cpuCount : data.cpu.loadAvg1 + 1} />
          <div className="text-[10px] text-muted-foreground">
            {data.cpu.cpuCount > 0 ? `负载 ${data.cpu.loadAvg1.toFixed(2)} / ${data.cpu.cpuCount} 核` : `1分钟均值 ${data.cpu.loadAvg1.toFixed(2)}`}
          </div>
        </div>

        {/* Memory */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
              <MemoryStick className="size-3" />
              内存
            </div>
            <span className="font-mono text-[11px] text-foreground">
              {formatBytes(data.memory.used)} / {formatBytes(data.memory.total)}
            </span>
          </div>
          <UsageBar used={data.memory.used} total={data.memory.total} />
        </div>

        {/* Swap */}
        {hasSwap && (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
                <MemoryStick className="size-3" />
                Swap
              </div>
              <span className="font-mono text-[11px] text-foreground">
                {formatBytes(data.swap.used)} / {formatBytes(data.swap.total)}
              </span>
            </div>
            <UsageBar used={data.swap.used} total={data.swap.total} colorClass="bg-warning" />
          </div>
        )}

        {/* Disk */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
              <HardDrive className="size-3" />
              磁盘
            </div>
            <span className="font-mono text-[11px] text-foreground">
              {formatBytes(data.disk.used)} / {formatBytes(data.disk.total)}
            </span>
          </div>
          <UsageBar used={data.disk.used} total={data.disk.total} colorClass="bg-primary" />
          <div className="truncate text-[10px] text-muted-foreground" title={data.disk.path}>{data.disk.path}</div>
        </div>
      </div>
    </div>
  );
}

'use client';

import { useEffect, useMemo, useRef } from 'react';
import { Activity, CheckCircle2, Copy, LoaderCircle } from 'lucide-react';
import { useLogStream, type ConsoleLine, type StreamState } from '@/hooks/use-log-stream';
import { Button } from './ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';

export function RuntimeConsole({ projectId }: { projectId: string }) {
  const { lines, streamState } = useLogStream(projectId);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const stickToBottomRef = useRef(true);

  // Track whether user has scrolled away from bottom
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const handleScroll = () => {
      stickToBottomRef.current = el.scrollTop + el.clientHeight >= el.scrollHeight - 40;
    };
    el.addEventListener('scroll', handleScroll);
    return () => el.removeEventListener('scroll', handleScroll);
  }, []);

  // Auto-scroll to bottom when new lines arrive
  useEffect(() => {
    if (stickToBottomRef.current && containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [lines]);

  const transcript = useMemo(() => {
    return lines.map((line) => `${new Date(line.timestamp).toLocaleTimeString()} [${line.source}] ${line.message}`).join('\n');
  }, [lines]);

  async function handleCopy() {
    await navigator.clipboard.writeText(transcript);
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <CardTitle>运行控制台</CardTitle>
            <CardDescription>实时日志与任务事件。</CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <StreamBadge state={streamState} />
            <Button type="button" variant="ghost" size="sm" onClick={handleCopy}>
              <Copy className="size-3.5" />
              复制日志
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="overflow-hidden rounded-2xl border border-border bg-console">
          <div className="flex items-center justify-between gap-4 border-b border-white/5 px-4 py-3 font-mono text-[11px] text-muted-foreground">
            <span>docker compose logs</span>
            <span>{lines.length} lines</span>
          </div>
          <div ref={containerRef} className="h-[34rem] overflow-auto px-4 py-3 font-mono text-[12px] leading-6 text-slate-200">
            {lines.length === 0 && streamState === 'connecting' ? (
              <div className="space-y-3 py-2">
                <div className="flex items-center gap-3 text-slate-500">
                  <LoaderCircle className="size-4 animate-spin" />
                  <span>正在连接 WebSocket 日志流...</span>
                </div>
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="grid grid-cols-[84px_72px_minmax(0,1fr)] gap-3 py-1.5">
                    <div className="h-4 animate-pulse rounded bg-white/[0.04]" />
                    <div className="h-4 animate-pulse rounded bg-white/[0.04]" />
                    <div className="h-4 animate-pulse rounded bg-white/[0.04]" style={{ width: `${50 + (i * 13) % 40}%` }} />
                  </div>
                ))}
              </div>
            ) : lines.length === 0 ? (
              <div className="rounded-xl border border-white/5 bg-white/[0.02] px-4 py-4 text-slate-500">
                {streamState === 'live' ? '已连接，等待日志输出...' : '暂无日志。'}
              </div>
            ) : null}
            {lines.map((line) => (
              <div key={line.id} className="grid grid-cols-[84px_72px_minmax(0,1fr)] gap-3 border-b border-white/5 py-1.5 last:border-b-0">
                <span className="text-slate-500">{new Date(line.timestamp).toLocaleTimeString()}</span>
                <span className={colorClass(line.source)}>[{line.source}]</span>
                <span className="whitespace-pre-wrap break-words">{line.message}</span>
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function StreamBadge({ state }: { state: StreamState }) {
  if (state === 'live') {
    return (
      <span className="inline-flex items-center gap-2 rounded-full border border-success/25 bg-success/10 px-3 py-1 text-[11px] text-success">
        <CheckCircle2 className="size-3.5" />
        实时连接
      </span>
    );
  }

  if (state === 'degraded') {
    return (
      <span className="inline-flex items-center gap-2 rounded-full border border-warning/25 bg-warning/10 px-3 py-1 text-[11px] text-warning">
        <Activity className="size-3.5" />
        部分连接
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-border bg-inset px-3 py-1 text-[11px] text-muted-foreground">
      <LoaderCircle className="size-3.5 animate-spin" />
      正在连接
    </span>
  );
}

function colorClass(source: ConsoleLine['source']) {
  switch (source) {
    case 'stderr':
      return 'text-rose-400';
    case 'stdout':
      return 'text-emerald-400';
    case 'task':
      return 'text-sky-400';
    default:
      return 'text-amber-300';
  }
}

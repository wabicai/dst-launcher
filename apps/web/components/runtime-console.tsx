'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Activity, CheckCircle2, Copy, LoaderCircle } from 'lucide-react';
import type { LogEvent, TaskEvent } from '@dst-launcher/shared';
import { toWsUrl } from '@/lib/api';
import { Button } from './ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';

type ConsoleLine = {
  id: string;
  source: 'stdout' | 'stderr' | 'system' | 'task';
  message: string;
  timestamp: string;
};

type StreamState = 'connecting' | 'live' | 'degraded';

export function RuntimeConsole({ projectId }: { projectId: string }) {
  const [lines, setLines] = useState<ConsoleLine[]>([]);
  const [streamState, setStreamState] = useState<StreamState>('connecting');
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let logOpen = false;
    let taskOpen = false;

    const syncState = () => {
      if (logOpen && taskOpen) {
        setStreamState('live');
        return;
      }

      if (logOpen || taskOpen) {
        setStreamState('degraded');
        return;
      }

      setStreamState('connecting');
    };

    const logsSocket = new WebSocket(toWsUrl(`/ws/logs?projectId=${projectId}`));
    const tasksSocket = new WebSocket(toWsUrl(`/ws/tasks?projectId=${projectId}`));

    logsSocket.onopen = () => {
      logOpen = true;
      syncState();
    };
    tasksSocket.onopen = () => {
      taskOpen = true;
      syncState();
    };

    logsSocket.onclose = () => {
      logOpen = false;
      syncState();
    };
    tasksSocket.onclose = () => {
      taskOpen = false;
      syncState();
    };

    logsSocket.onerror = () => setStreamState('degraded');
    tasksSocket.onerror = () => setStreamState('degraded');

    logsSocket.onmessage = (event) => {
      const payload = JSON.parse(event.data) as LogEvent;
      setLines((current) => [
        ...current.slice(-299),
        {
          id: `${payload.timestamp}-${Math.random()}`,
          source: payload.stream,
          message: payload.line,
          timestamp: payload.timestamp,
        },
      ]);
    };

    tasksSocket.onmessage = (event) => {
      const payload = JSON.parse(event.data) as TaskEvent;
      const message = 'message' in payload ? payload.message : payload.status;
      setLines((current) => [
        ...current.slice(-299),
        {
          id: `${payload.timestamp}-${Math.random()}`,
          source: 'task',
          message: `[${payload.type}] ${message}`.trim(),
          timestamp: payload.timestamp,
        },
      ]);
    };

    return () => {
      logsSocket.close();
      tasksSocket.close();
    };
  }, [projectId]);

  useEffect(() => {
    const node = containerRef.current;
    if (!node) {
      return;
    }

    node.scrollTo({ top: node.scrollHeight, behavior: 'smooth' });
  }, [lines.length]);

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
            {lines.length === 0 ? <div className="rounded-xl border border-white/5 bg-white/[0.02] px-4 py-4 text-slate-500">暂无日志。</div> : null}
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

'use client';

import { useEffect, useMemo, useState } from 'react';
import type { LogEvent, TaskEvent } from '@dst-launcher/shared';
import { toWsUrl } from '@/lib/api';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';

type ConsoleLine = {
  id: string;
  source: 'stdout' | 'stderr' | 'system' | 'task';
  message: string;
  timestamp: string;
};

export function RuntimeConsole({ projectId }: { projectId: string }) {
  const [lines, setLines] = useState<ConsoleLine[]>([]);

  useEffect(() => {
    const logsSocket = new WebSocket(toWsUrl(`/ws/logs?projectId=${projectId}`));
    const tasksSocket = new WebSocket(toWsUrl(`/ws/tasks?projectId=${projectId}`));

    logsSocket.onmessage = (event) => {
      const payload = JSON.parse(event.data) as LogEvent;
      setLines((current) => [...current.slice(-299), { id: `${payload.timestamp}-${Math.random()}`, source: payload.stream, message: payload.line, timestamp: payload.timestamp }]);
    };

    tasksSocket.onmessage = (event) => {
      const payload = JSON.parse(event.data) as TaskEvent;
      const message = 'message' in payload ? payload.message : payload.status;
      setLines((current) => [...current.slice(-299), { id: `${payload.timestamp}-${Math.random()}`, source: 'task', message: `[${payload.type}] ${message}`.trim(), timestamp: payload.timestamp }]);
    };

    return () => {
      logsSocket.close();
      tasksSocket.close();
    };
  }, [projectId]);

  const rendered = useMemo(() => lines.slice().reverse(), [lines]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>运行控制台</CardTitle>
        <CardDescription>实时串流 `docker compose logs` 与任务事件。排查启动失败、镜像拉取或端口冲突时，优先看这里。</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="h-[34rem] overflow-auto rounded-2xl border border-white/5 bg-[#0c1020] p-4 font-mono text-xs leading-6 text-slate-200">
          {rendered.length === 0 ? <div className="text-slate-500">暂无日志。启动项目后会自动开始输出。</div> : null}
          {rendered.map((line) => (
            <div key={line.id} className="border-b border-white/5 py-1 last:border-b-0">
              <span className="mr-3 text-slate-500">{new Date(line.timestamp).toLocaleTimeString()}</span>
              <span className={colorClass(line.source)}>[{line.source}]</span>
              <span className="ml-2 whitespace-pre-wrap">{line.message}</span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
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

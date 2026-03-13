'use client';

import { useEffect, useState } from 'react';
import type { LogEvent, TaskEvent } from '@dst-launcher/shared';
import { toWsUrl } from '@/lib/api';

export type ConsoleLine = {
  id: string;
  source: 'stdout' | 'stderr' | 'system' | 'task';
  message: string;
  timestamp: string;
};

export type StreamState = 'connecting' | 'live' | 'degraded';

export function useLogStream(projectId: string, maxLines = 300) {
  const [lines, setLines] = useState<ConsoleLine[]>([]);
  const [lastTaskEvent, setLastTaskEvent] = useState<TaskEvent | null>(null);
  const [streamState, setStreamState] = useState<StreamState>('connecting');

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
        ...current.slice(-(maxLines - 1)),
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
      setLastTaskEvent(payload);
      const message = 'message' in payload ? payload.message : ('status' in payload ? payload.status : '');
      setLines((current) => [
        ...current.slice(-(maxLines - 1)),
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
  }, [projectId, maxLines]);

  return { lines, lastTaskEvent, streamState };
}

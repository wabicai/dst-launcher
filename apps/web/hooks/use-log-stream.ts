'use client';

import { useEffect, useRef, useState } from 'react';
import type { LogEvent, TaskEvent } from '@dst-launcher/shared';
import { toWsUrl } from '@/lib/api';

export type ConsoleLine = {
  id: string;
  source: 'stdout' | 'stderr' | 'system' | 'task';
  message: string;
  timestamp: string;
};

export type StreamState = 'connecting' | 'live' | 'degraded';

let lineSeq = 0;

function createReconnectingSocket(url: string, handlers: {
  onOpen: () => void;
  onClose: () => void;
  onMessage: (event: MessageEvent) => void;
}) {
  let socket: WebSocket | null = null;
  let disposed = false;
  let retryDelay = 1000;

  function connect() {
    if (disposed) return;
    socket = new WebSocket(url);
    socket.onopen = () => {
      retryDelay = 1000;
      handlers.onOpen();
    };
    socket.onclose = () => {
      handlers.onClose();
      if (!disposed) {
        setTimeout(connect, retryDelay);
        retryDelay = Math.min(retryDelay * 2, 15000);
      }
    };
    socket.onerror = () => { /* onclose will fire next */ };
    socket.onmessage = handlers.onMessage;
  }

  connect();

  return () => {
    disposed = true;
    socket?.close();
  };
}

export function useLogStream(projectId: string, maxLines = 300) {
  const [lines, setLines] = useState<ConsoleLine[]>([]);
  const [lastTaskEvent, setLastTaskEvent] = useState<TaskEvent | null>(null);
  const [streamState, setStreamState] = useState<StreamState>('connecting');
  const logOpenRef = useRef(false);
  const taskOpenRef = useRef(false);

  useEffect(() => {
    logOpenRef.current = false;
    taskOpenRef.current = false;

    const syncState = () => {
      if (logOpenRef.current && taskOpenRef.current) {
        setStreamState('live');
      } else if (logOpenRef.current || taskOpenRef.current) {
        setStreamState('degraded');
      } else {
        setStreamState('connecting');
      }
    };

    const disposeLog = createReconnectingSocket(
      toWsUrl(`/ws/logs?projectId=${projectId}`),
      {
        onOpen: () => { logOpenRef.current = true; syncState(); },
        onClose: () => { logOpenRef.current = false; syncState(); },
        onMessage: (event) => {
          const payload = JSON.parse(event.data) as LogEvent;
          setLines((current) => [
            ...current.slice(-(maxLines - 1)),
            {
              id: `log-${++lineSeq}`,
              source: payload.stream,
              message: payload.line,
              timestamp: payload.timestamp,
            },
          ]);
        },
      },
    );

    const disposeTask = createReconnectingSocket(
      toWsUrl(`/ws/tasks?projectId=${projectId}`),
      {
        onOpen: () => { taskOpenRef.current = true; syncState(); },
        onClose: () => { taskOpenRef.current = false; syncState(); },
        onMessage: (event) => {
          const payload = JSON.parse(event.data) as TaskEvent;
          setLastTaskEvent(payload);
          const message = 'message' in payload ? payload.message : ('status' in payload ? payload.status : '');
          setLines((current) => [
            ...current.slice(-(maxLines - 1)),
            {
              id: `task-${++lineSeq}`,
              source: 'task',
              message: `[${payload.type}] ${message}`.trim(),
              timestamp: payload.timestamp,
            },
          ]);
        },
      },
    );

    return () => {
      disposeLog();
      disposeTask();
    };
  }, [projectId, maxLines]);

  return { lines, lastTaskEvent, streamState };
}

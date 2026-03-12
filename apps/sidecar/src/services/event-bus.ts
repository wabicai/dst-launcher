import { EventEmitter } from 'node:events';
import type { LogEvent, TaskEvent } from '@dst-launcher/shared';

export class EventBus {
  private readonly emitter = new EventEmitter();

  publishTask(event: TaskEvent) {
    this.emitter.emit(`tasks:${event.projectId}`, event);
  }

  publishLog(event: LogEvent) {
    this.emitter.emit(`logs:${event.projectId}`, event);
  }

  subscribeTasks(projectId: string, callback: (event: TaskEvent) => void) {
    this.emitter.on(`tasks:${projectId}`, callback);
    return () => this.emitter.off(`tasks:${projectId}`, callback);
  }

  subscribeLogs(projectId: string, callback: (event: LogEvent) => void) {
    this.emitter.on(`logs:${projectId}`, callback);
    return () => this.emitter.off(`logs:${projectId}`, callback);
  }
}

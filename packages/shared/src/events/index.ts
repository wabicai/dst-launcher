import { z } from 'zod';
import { ProjectActionSchema } from '../schemas/project';

export const TaskEventSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('task.started'),
    projectId: z.string(),
    taskId: z.string(),
    action: ProjectActionSchema,
    message: z.string(),
    timestamp: z.string(),
  }),
  z.object({
    type: z.literal('task.progress'),
    projectId: z.string(),
    taskId: z.string(),
    action: ProjectActionSchema,
    message: z.string(),
    timestamp: z.string(),
  }),
  z.object({
    type: z.literal('task.finished'),
    projectId: z.string(),
    taskId: z.string(),
    action: ProjectActionSchema,
    message: z.string(),
    timestamp: z.string(),
  }),
  z.object({
    type: z.literal('task.failed'),
    projectId: z.string(),
    taskId: z.string(),
    action: ProjectActionSchema,
    message: z.string(),
    timestamp: z.string(),
  }),
  z.object({
    type: z.literal('status.changed'),
    projectId: z.string(),
    status: z.enum(['idle', 'running', 'stopped', 'error', 'unknown']),
    timestamp: z.string(),
  }),
]);

export const LogEventSchema = z.object({
  type: z.literal('log.line'),
  projectId: z.string(),
  line: z.string(),
  stream: z.enum(['stdout', 'stderr', 'system']),
  timestamp: z.string(),
});

export type TaskEvent = z.infer<typeof TaskEventSchema>;
export type LogEvent = z.infer<typeof LogEventSchema>;

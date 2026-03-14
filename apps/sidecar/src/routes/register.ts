import type { FastifyInstance } from 'fastify';
import {
  ModImportRequestSchema,
  ProjectActionSchema,
  ProjectConfigUpdateSchema,
  ProjectCreateSchema,
  ProjectModsUpdateSchema,
  TargetTestRequestSchema,
} from '@dst-launcher/shared';
import type { ProjectService } from '../services/project-service';
import type { EventBus } from '../services/event-bus';

export async function registerRoutes(
  app: FastifyInstance,
  projectService: ProjectService,
  eventBus: EventBus,
) {
  app.get('/health', async () => {
    return {
      ok: true,
      service: 'dst-launcher-sidecar',
      timestamp: new Date().toISOString(),
    };
  });

  app.get('/projects', async () => projectService.listProjects());

  app.post('/projects', async (request, reply) => {
    try {
      const payload = ProjectCreateSchema.parse(request.body);
      return await projectService.createProject(payload);
    } catch (error) {
      reply.code(400);
      return { message: error instanceof Error ? error.message : '创建项目失败' };
    }
  });

  app.get('/projects/:id', async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      return await projectService.getProject(id);
    } catch (error) {
      reply.code(404);
      return { message: error instanceof Error ? error.message : '项目不存在' };
    }
  });

  app.put('/projects/:id/config', async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const payload = ProjectConfigUpdateSchema.parse(request.body);
      return await projectService.updateProject(id, payload);
    } catch (error) {
      reply.code(400);
      return { message: error instanceof Error ? error.message : '更新项目失败' };
    }
  });

  app.post('/projects/:id/actions/:action', async (request, reply) => {
    try {
      const { id, action } = request.params as { id: string; action: string };
      const normalizedAction = ProjectActionSchema.parse(action);
      return await projectService.runAction(id, normalizedAction);
    } catch (error) {
      reply.code(400);
      return { message: error instanceof Error ? error.message : '执行操作失败' };
    }
  });

  app.post('/targets/test', async (request, reply) => {
    try {
      const payload = TargetTestRequestSchema.parse(request.body);
      return await projectService.testTarget(payload.target);
    } catch (error) {
      reply.code(400);
      return { message: error instanceof Error ? error.message : '测试目标失败' };
    }
  });

  app.get('/mods/search', async (request, reply) => {
    try {
      const query = String((request.query as { q?: string; page?: string }).q ?? '');
      const page = Number((request.query as { q?: string; page?: string }).page ?? '1');
      return await projectService.searchMods(query, Number.isFinite(page) && page > 0 ? page : 1);
    } catch (error) {
      reply.code(400);
      return { message: error instanceof Error ? error.message : '模组搜索失败' };
    }
  });

  app.get('/mods/recommendations', async (_request, reply) => {
    try {
      return await projectService.getRecommendations();
    } catch (error) {
      reply.code(400);
      return { message: error instanceof Error ? error.message : '模组推荐加载失败' };
    }
  });

  app.post('/mods/import', async (request, reply) => {
    try {
      const payload = ModImportRequestSchema.parse(request.body);
      return await projectService.importMods(payload.value);
    } catch (error) {
      reply.code(400);
      return { message: error instanceof Error ? error.message : '模组导入失败' };
    }
  });

  app.get('/projects/:id/stats', async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      return await projectService.getProjectStats(id);
    } catch (error) {
      reply.code(500);
      return { message: error instanceof Error ? error.message : '获取服务器状态失败' };
    }
  });

  app.get('/projects/:id/mods', async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      return await projectService.getProjectMods(id);
    } catch (error) {
      reply.code(404);
      return { message: error instanceof Error ? error.message : '项目模组数据不存在' };
    }
  });

  app.put('/projects/:id/mods', async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const payload = ProjectModsUpdateSchema.parse(request.body);
      return await projectService.updateProjectMods(id, payload);
    } catch (error) {
      reply.code(400);
      return { message: error instanceof Error ? error.message : '更新项目模组失败' };
    }
  });

  app.get('/ws/tasks', { websocket: true }, (socket, request) => {
    const projectId = extractProjectId(request.url);
    if (!projectId) {
      safeSocketSend(socket, { type: 'error', message: '缺少 projectId' });
      socket.close();
      return;
    }

    const unsubscribe = eventBus.subscribeTasks(projectId, (event) => {
      safeSocketSend(socket, event);
    });

    socket.on('close', unsubscribe);
  });

  app.get('/ws/logs', { websocket: true }, async (socket, request) => {
    const projectId = extractProjectId(request.url);
    if (!projectId) {
      safeSocketSend(socket, { type: 'error', message: '缺少 projectId' });
      socket.close();
      return;
    }

    const unsubscribe = eventBus.subscribeLogs(projectId, (event) => {
      safeSocketSend(socket, event);
    });

    let child: Awaited<ReturnType<ProjectService['streamLogs']>> | null = null;
    try {
      child = await projectService.streamLogs(projectId, (line, stream) => {
        safeSocketSend(socket, {
          type: 'log.line',
          projectId,
          line,
          stream,
          timestamp: new Date().toISOString(),
        });
      });
    } catch (error) {
      safeSocketSend(socket, {
        type: 'log.line',
        projectId,
        line: error instanceof Error ? error.message : '日志订阅失败',
        stream: 'system',
        timestamp: new Date().toISOString(),
      });
    }

    socket.on('close', () => {
      unsubscribe();
      child?.kill();
    });
  });
}

function safeSocketSend(socket: { readyState: number; send: (payload: string) => void }, payload: unknown) {
  if (socket.readyState !== 1) {
    return;
  }

  try {
    socket.send(JSON.stringify(payload));
  } catch {
    // 连接关闭过程中忽略发送失败，避免影响 sidecar 主进程。
  }
}

function extractProjectId(url?: string) {
  if (!url) return null;
  try {
    const parsed = new URL(url, 'http://127.0.0.1');
    return parsed.searchParams.get('projectId');
  } catch {
    return null;
  }
}

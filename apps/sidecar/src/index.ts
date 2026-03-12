import fs from 'node:fs';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import websocket from '@fastify/websocket';
import { createDatabase } from './db/client';
import { ProjectRepository } from './db/repository';
import { EventBus } from './services/event-bus';
import { ProjectService } from './services/project-service';
import { resolveAppPaths } from './utils/paths';
import { registerRoutes } from './routes/register';

async function start() {
  const args = parseArgs(process.argv.slice(2));
  const port = Number(args.port ?? 0);
  const paths = resolveAppPaths(args['app-data']);
  fs.mkdirSync(paths.appDataDir, { recursive: true });
  fs.mkdirSync(paths.instancesDir, { recursive: true });

  const db = createDatabase(paths.dbFile);
  const repository = new ProjectRepository(db);
  const eventBus = new EventBus();
  const projectService = new ProjectService(repository, eventBus, paths);

  const app = Fastify({ logger: false });
  await app.register(cors, {
    origin: true,
    credentials: true,
  });
  await app.register(websocket);
  await registerRoutes(app, projectService, eventBus);

  const address = await app.listen({
    host: '127.0.0.1',
    port,
  });

  process.stdout.write(`${address}\n`);
}

void start().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
  process.exit(1);
});

function parseArgs(args: string[]) {
  return args.reduce<Record<string, string>>((acc, current, index) => {
    if (!current.startsWith('--')) return acc;
    const key = current.replace(/^--/, '');
    const next = args[index + 1];
    if (next && !next.startsWith('--')) {
      acc[key] = next;
    } else {
      acc[key] = 'true';
    }
    return acc;
  }, {});
}

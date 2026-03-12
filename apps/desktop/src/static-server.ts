import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';

export interface StaticWebServer {
  readonly origin: string;
  close(): Promise<void>;
}

export async function createStaticWebServer(rootDir: string): Promise<StaticWebServer> {
  await fs.access(path.join(rootDir, 'index.html'));

  const server = http.createServer(async (request, response) => {
    try {
      const requestUrl = new URL(request.url || '/', 'http://127.0.0.1');
      const filePath = await resolveStaticFile(rootDir, requestUrl.pathname);

      if (!filePath) {
        response.statusCode = 404;
        response.end('Not Found');
        return;
      }

      const body = await fs.readFile(filePath);
      response.statusCode = 200;
      response.setHeader('Content-Type', contentTypeFor(filePath));
      response.end(body);
    } catch {
      response.statusCode = 500;
      response.end('Internal Server Error');
    }
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve());
  });

  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('静态资源服务启动失败');
  }

  return {
    origin: `http://127.0.0.1:${address.port}`,
    close() {
      return new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }
          resolve();
        });
      });
    },
  };
}

async function resolveStaticFile(rootDir: string, pathname: string) {
  const normalizedPath = pathname === '/' ? '/index.html' : pathname;
  const safePath = path.posix.normalize(normalizedPath).replace(/^\/+/, '');
  const candidates = [
    safePath,
    safePath.endsWith('.html') ? null : `${safePath}.html`,
    path.posix.join(safePath, 'index.html'),
  ].filter((candidate): candidate is string => !!candidate);

  for (const candidate of candidates) {
    const resolved = path.resolve(rootDir, candidate);
    if (!resolved.startsWith(path.resolve(rootDir))) {
      continue;
    }
    try {
      const stat = await fs.stat(resolved);
      if (stat.isFile()) {
        return resolved;
      }
    } catch {
      // 继续尝试下一个候选路径
    }
  }

  return null;
}

function contentTypeFor(filePath: string) {
  const extension = path.extname(filePath).toLowerCase();
  switch (extension) {
    case '.html':
      return 'text/html; charset=utf-8';
    case '.css':
      return 'text/css; charset=utf-8';
    case '.js':
      return 'text/javascript; charset=utf-8';
    case '.json':
      return 'application/json; charset=utf-8';
    case '.svg':
      return 'image/svg+xml';
    case '.woff2':
      return 'font/woff2';
    case '.png':
      return 'image/png';
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg';
    default:
      return 'application/octet-stream';
  }
}

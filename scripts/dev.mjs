import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { spawn } from 'node:child_process';

const rootDir = '/Volumes/ai-work/dst-launcher';
const port = String(await findFreePort(Number(process.env.PORT || '3747')));
const nextDevServerUrl = `http://127.0.0.1:${port}`;
const desktopMainFile = path.join(rootDir, 'apps/desktop/dist/main.js');
const webDir = path.join(rootDir, 'apps/web');
const desktopDir = path.join(rootDir, 'apps/desktop');
const sharedDir = path.join(rootDir, 'packages/shared');

let shuttingDown = false;
const children = new Map();

try {
  await runStep('SHARED', path.join(sharedDir, 'node_modules/.bin/tsup'), ['src/index.ts', '--format', 'esm', '--dts', '--clean'], {
    cwd: sharedDir,
  });

  const sharedWatch = spawnLogged(
    'SHARED:WATCH',
    path.join(sharedDir, 'node_modules/.bin/tsup'),
    ['src/index.ts', '--format', 'esm', '--dts', '--watch'],
    { cwd: sharedDir },
  );
  children.set('SHARED:WATCH', sharedWatch);

  const web = spawnLogged('WEB', path.join(webDir, 'node_modules/.bin/next'), ['dev', '--port', port], {
    cwd: webDir,
    env: {
      ...process.env,
      PORT: port,
    },
  });

  const desktopBuild = spawnLogged(
    'DESKTOP:BUILD',
    path.join(desktopDir, 'node_modules/.bin/tsup'),
    [
      'src/main.ts',
      'src/preload.ts',
      '--format',
      'cjs',
      '--target',
      'node22',
      '--platform',
      'node',
      '--out-dir',
      'dist',
      '--external',
      'electron',
      '--external',
      'tsx',
      '--watch',
    ],
    {
      cwd: desktopDir,
    },
  );

  children.set('WEB', web);
  children.set('DESKTOP:BUILD', desktopBuild);

  await Promise.all([
    waitForFile(desktopMainFile, 15_000),
    waitForTcpPort(Number(port), 20_000),
  ]);

  const desktopElectron = spawnLogged('DESKTOP:ELECTRON', path.join(desktopDir, 'node_modules/.bin/electronmon'), ['dist/main.js'], {
    cwd: desktopDir,
    env: {
      ...process.env,
      NEXT_DEV_SERVER_URL: nextDevServerUrl,
      NEXT_DEV_SERVER_PORT: port,
    },
  });
  children.set('DESKTOP:ELECTRON', desktopElectron);

  const stop = async () => {
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;
    await shutdownChildren();
    process.exit(0);
  };

  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);

  await new Promise(() => {});
} catch (error) {
  shuttingDown = true;
  await shutdownChildren();
  console.error(formatPrefix('DEV'), error instanceof Error ? error.message : String(error));
  process.exit(1);
}

async function runStep(name, command, args, options = {}) {
  process.stdout.write(`${formatPrefix(name)} 启动 ${command} ${args.join(' ')}\n`);
  await new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd ?? rootDir,
      env: {
        ...process.env,
        ...options.env,
      },
      stdio: 'inherit',
    });

    child.once('exit', (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`${name} 退出异常（code=${code ?? 'null'}, signal=${signal ?? 'none'}）`));
    });

    child.once('error', (error) => reject(error));
  });
}

function spawnLogged(name, command, args, options = {}) {
  const child = spawn(command, args, {
    cwd: options.cwd ?? rootDir,
    env: {
      ...process.env,
      ...options.env,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  pipeLines(name, child.stdout);
  pipeLines(name, child.stderr);

  child.once('exit', async (code, signal) => {
    children.delete(name);
    if (shuttingDown) {
      return;
    }

    shuttingDown = true;
    await shutdownChildren();
    const reason = `子进程 ${name} 提前退出（code=${code ?? 'null'}, signal=${signal ?? 'none'}）`;
    console.error(formatPrefix('DEV'), reason);
    process.exit(code ?? 1);
  });

  child.once('error', async (error) => {
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;
    await shutdownChildren();
    console.error(formatPrefix('DEV'), `${name} 启动失败: ${error.message}`);
    process.exit(1);
  });

  return child;
}

async function shutdownChildren() {
  const runningChildren = [...children.values()];
  for (const child of runningChildren) {
    if (!child.killed) {
      child.kill('SIGINT');
    }
  }

  await Promise.all(runningChildren.map((child) => waitForExit(child, 5_000)));
}

async function waitForExit(child, timeoutMs) {
  if (child.exitCode !== null) {
    return;
  }

  await new Promise((resolve) => {
    const timeout = setTimeout(() => {
      if (child.exitCode === null && !child.killed) {
        child.kill('SIGKILL');
      }
      resolve();
    }, timeoutMs);

    child.once('exit', () => {
      clearTimeout(timeout);
      resolve();
    });
  });
}

async function waitForFile(filePath, timeoutMs) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (fs.existsSync(filePath)) {
      return;
    }
    await sleep(150);
  }
  throw new Error(`等待文件超时: ${filePath}`);
}

async function waitForTcpPort(targetPort, timeoutMs) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const ok = await new Promise((resolve) => {
      const socket = net.createConnection({ host: '127.0.0.1', port: targetPort });
      socket.once('connect', () => {
        socket.end();
        resolve(true);
      });
      socket.once('error', () => {
        socket.destroy();
        resolve(false);
      });
    });

    if (ok) {
      return;
    }
    await sleep(150);
  }
  throw new Error(`等待开发服务器端口超时: ${targetPort}`);
}

function pipeLines(name, stream) {
  if (!stream) {
    return;
  }

  let buffer = '';
  stream.on('data', (chunk) => {
    buffer += chunk.toString();
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() ?? '';
    for (const line of lines) {
      if (!line.trim()) {
        continue;
      }
      process.stdout.write(`${formatPrefix(name)} ${line}\n`);
    }
  });

  stream.on('end', () => {
    if (buffer.trim()) {
      process.stdout.write(`${formatPrefix(name)} ${buffer}\n`);
      buffer = '';
    }
  });
}

function formatPrefix(name) {
  return `[${name}]`;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function findFreePort(preferredPort, maxTries = 20) {
  return new Promise((resolve, reject) => {
    let attempt = preferredPort;
    const tryNext = () => {
      const server = net.createServer();
      server.once('error', () => {
        attempt += 1;
        if (attempt >= preferredPort + maxTries) {
          reject(new Error(`找不到空闲端口（已尝试 ${preferredPort}–${attempt - 1}）`));
        } else {
          tryNext();
        }
      });
      server.once('listening', () => {
        server.close(() => resolve(attempt));
      });
      server.listen(attempt, '127.0.0.1');
    };
    tryNext();
  });
}

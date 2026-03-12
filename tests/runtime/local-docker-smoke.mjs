import dgram from 'node:dgram';
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { setTimeout as delay } from 'node:timers/promises';
import { createDefaultClusterConfig } from '../../packages/shared/dist/index.js';

const ROOT_DIR = '/Volumes/ai-work/dst-launcher';
const SIDECAR_ENTRY = path.join(ROOT_DIR, 'apps/sidecar/dist/index.cjs');
const EXIT_CODES = {
  dockerUnavailable: 10,
  tokenMissing: 11,
  portConflict: 12,
  imagePullFailed: 13,
  tokenInvalid: 14,
  containerExited: 15,
  logsMissing: 16,
  backupMissing: 17,
  unknown: 1,
};

const ERROR_LABELS = {
  dockerUnavailable: 'Docker Desktop 未启动',
  tokenMissing: 'Klei Token 缺失',
  portConflict: '端口冲突',
  imagePullFailed: '镜像拉取失败',
  tokenInvalid: 'Klei Token 无效',
  containerExited: '容器启动后异常退出',
  logsMissing: '日志流缺失',
  backupMissing: '备份记录缺失',
  unknown: '未知错误',
};

const runtimeContext = {
  appDataDir: '',
  composeFile: '',
  projectId: '',
  slug: '',
  dockerContext: 'desktop-linux',
  sidecar: null,
  sidecarBaseUrl: '',
  sidecarLogs: '',
  runtimeLogs: [],
};


class RuntimeSmokeError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

try {
  assertDockerDaemon();
  const clusterToken = process.env.DST_KLEI_TOKEN?.trim();
  if (!clusterToken) {
    throw new RuntimeSmokeError(
      'tokenMissing',
      '缺少 `DST_KLEI_TOKEN`，无法执行真实 DST Docker 验证。',
    );
  }

  runtimeContext.appDataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'dst-launcher-runtime-'));
  runtimeContext.sidecar = spawn(process.execPath, [SIDECAR_ENTRY, '--port', '0', '--app-data', runtimeContext.appDataDir], {
    cwd: ROOT_DIR,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  runtimeContext.sidecar.stderr.on('data', (chunk) => {
    runtimeContext.sidecarLogs += chunk.toString();
  });

  runtimeContext.sidecarBaseUrl = await waitForSidecarAddress(runtimeContext.sidecar);

  const ports = await allocateProjectPorts();
  const slug = `runtime-${Date.now().toString(36)}`;
  runtimeContext.slug = slug;

  const clusterConfig = createDefaultClusterConfig(`Runtime ${slug}`);
  clusterConfig.clusterToken = clusterToken;
  clusterConfig.master.serverPort = ports[0];
  clusterConfig.master.masterServerPort = ports[1];
  clusterConfig.master.authenticationPort = ports[2];
  clusterConfig.caves.serverPort = ports[3];
  clusterConfig.caves.masterServerPort = ports[4];
  clusterConfig.caves.authenticationPort = ports[5];

  const createdProject = await requestJson(`${runtimeContext.sidecarBaseUrl}/projects`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      name: `Runtime ${slug}`,
      slug,
      description: '本地 Docker 真实验证',
      target: {
        type: 'local',
        dockerContext: runtimeContext.dockerContext,
      },
      clusterConfig,
    }),
  });

  runtimeContext.projectId = createdProject.id;
  runtimeContext.composeFile = createdProject.deployment?.composePath ?? path.join(runtimeContext.appDataDir, 'instances', slug, 'compose', 'docker-compose.yml');

  if (createdProject.network?.status !== 'not_applicable') {
    throw new RuntimeSmokeError('unknown', `本地项目的 network 状态异常：${createdProject.network?.status ?? 'missing'}`);
  }

  const portTask = await runActionAndLoadTask('check-ports');
  if (portTask.message.includes('发现端口冲突')) {
    throw new RuntimeSmokeError('portConflict', `端口检查失败：\n${portTask.message}`);
  }

  await runActionAndLoadTask('deploy');
  await assertDeploymentArtifacts(slug);

  await runActionAndLoadTask('start');
  await waitForRunningContainers();
  const firstLogLine = await waitForRuntimeLog().catch(async () => await readLocalLogs());
  console.log(`收到运行日志: ${firstLogLine}`);

  await runActionAndLoadTask('stop');
  const backupTask = await runActionAndLoadTask('backup');
  const detail = await getProjectDetail();
  const backup = detail.backups[0];
  if (!backup?.location) {
    throw new RuntimeSmokeError('backupMissing', `备份任务已完成，但未找到备份记录。\n${backupTask.message}`);
  }
  await fs.access(backup.location);

  console.log('本地 Docker 真实验证通过：deploy -> start -> logs -> stop -> backup');
} catch (error) {
  const normalized = normalizeError(error);
  console.error(`运行时验证失败 [${normalized.label}]`);
  console.error(normalized.message);
  process.exitCode = normalized.exitCode;
} finally {
  await cleanup();
}

async function assertDeploymentArtifacts(slug) {
  const rootDir = path.join(runtimeContext.appDataDir, 'instances', slug);
  const requiredFiles = [
    path.join(rootDir, 'compose', 'docker-compose.yml'),
    path.join(rootDir, 'data', 'cluster', 'cluster.ini'),
    path.join(rootDir, 'data', 'cluster', 'cluster_token.txt'),
    path.join(rootDir, 'data', 'cluster', 'Master', 'server.ini'),
    path.join(rootDir, 'data', 'cluster', 'Caves', 'server.ini'),
  ];

  for (const file of requiredFiles) {
    await fs.access(file);
  }
}

function assertDockerDaemon() {
  const result = spawnSync('docker', ['version', '--format', '{{.Server.Version}}'], {
    cwd: ROOT_DIR,
    encoding: 'utf8',
  });

  if (result.status !== 0) {
    throw new RuntimeSmokeError(
      'dockerUnavailable',
      `Docker daemon 不可用，请先启动 Docker Desktop。\n${(result.stderr || result.stdout || '').trim()}`,
    );
  }
}

async function allocateProjectPorts() {
  const ports = [];
  for (let index = 0; index < 6; index += 1) {
    ports.push(await reserveUdpPort());
  }
  return ports;
}

async function reserveUdpPort() {
  const socket = dgram.createSocket('udp4');
  await new Promise((resolve, reject) => {
    socket.once('error', reject);
    socket.bind(0, '127.0.0.1', resolve);
  });
  const address = socket.address();
  const port = typeof address === 'string' ? 0 : address.port;
  socket.close();
  if (!port) {
    throw new RuntimeSmokeError('portConflict', '无法分配可用的 UDP 端口。');
  }
  return port;
}

async function waitForRunningContainers() {
  const startedAt = Date.now();
  let lastDetail = null;

  while (Date.now() - startedAt < 120000) {
    lastDetail = await getProjectDetail();
    const containers = lastDetail.runtime.containers;
    const runningContainers = containers.filter((item) => item.state === 'running');
    if (runningContainers.length >= 2) {
      return lastDetail;
    }
    await delay(3000);
  }

  const logText = runtimeContext.runtimeLogs.join('\n');
  if (/token|auth|login|dedicated server/i.test(logText)) {
    throw new RuntimeSmokeError('tokenInvalid', `容器未能稳定运行，日志疑似指向 Klei Token 无效。\n${logText}`);
  }

  throw new RuntimeSmokeError(
    'containerExited',
    `容器在启动后未能保持运行。\n${JSON.stringify(lastDetail?.runtime?.containers ?? [], null, 2)}\n${logText}`,
  );
}

async function waitForRuntimeLog() {
  const websocket = new WebSocket(`${runtimeContext.sidecarBaseUrl.replace('http', 'ws')}/ws/logs?projectId=${encodeURIComponent(runtimeContext.projectId)}`);

  return await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      websocket.close();
      reject(new RuntimeSmokeError('logsMissing', '容器已启动，但在限定时间内没有收到真实运行日志。'));
    }, 45000);

    websocket.addEventListener('message', (event) => {
      try {
        const payload = JSON.parse(String(event.data));
        if (payload.type !== 'log.line' || payload.stream === 'system') {
          return;
        }
        runtimeContext.runtimeLogs.push(payload.line);
        clearTimeout(timeout);
        websocket.close();
        resolve(payload.line);
      } catch {
        // 忽略非法消息
      }
    });

    websocket.addEventListener('error', () => {
      clearTimeout(timeout);
      reject(new RuntimeSmokeError('logsMissing', 'WebSocket 日志订阅失败。'));
    });
  });
}

async function readLocalLogs() {
  const result = spawnSync('docker', [
    '--context',
    runtimeContext.dockerContext,
    'compose',
    '-f',
    runtimeContext.composeFile,
    '-p',
    runtimeContext.slug,
    'logs',
    '--tail',
    '80',
  ], {
    cwd: ROOT_DIR,
    encoding: 'utf8',
  });

  const output = `${result.stdout || ''}
${result.stderr || ''}`.trim();
  const line = output
    .split(/\r?\n/)
    .map((entry) => entry.trim())
    .find(Boolean);

  if (!line) {
    throw new RuntimeSmokeError('logsMissing', '容器已启动，但未能读取到本地运行日志。');
  }

  runtimeContext.runtimeLogs.push(line);
  return line;
}

async function runActionAndLoadTask(action) {
  try {
    await requestJson(`${runtimeContext.sidecarBaseUrl}/projects/${runtimeContext.projectId}/actions/${action}`, {
      method: 'POST',
    });
  } catch (error) {
    throw mapActionError(action, error);
  }

  const detail = await getProjectDetail();
  const task = detail.tasks.find((item) => item.action === action);
  if (!task) {
    throw new RuntimeSmokeError('unknown', `操作 ${action} 已返回，但未找到对应任务记录。`);
  }
  if (task.status !== 'success') {
    throw mapActionError(action, new Error(task.message));
  }
  return task;
}

async function getProjectDetail() {
  return await requestJson(`${runtimeContext.sidecarBaseUrl}/projects/${runtimeContext.projectId}`);
}

function mapActionError(action, error) {
  const message = error instanceof Error ? error.message : String(error);
  if (/发现端口冲突|port is already allocated|address already in use|bind: address already in use/i.test(message)) {
    return new RuntimeSmokeError('portConflict', `操作 ${action} 失败：\n${message}`);
  }
  if (/pull access denied|failed to resolve reference|manifest unknown|no matching manifest|toomanyrequests/i.test(message)) {
    return new RuntimeSmokeError('imagePullFailed', `操作 ${action} 失败，镜像拉取异常：\n${message}`);
  }
  if (/Cannot connect to the Docker daemon|docker daemon|error during connect/i.test(message)) {
    return new RuntimeSmokeError('dockerUnavailable', `操作 ${action} 失败，Docker daemon 不可用：\n${message}`);
  }
  if (/token|auth|login|dedicated server/i.test(message)) {
    return new RuntimeSmokeError('tokenInvalid', `操作 ${action} 失败，疑似 Klei Token 无效：\n${message}`);
  }
  return new RuntimeSmokeError('unknown', `操作 ${action} 失败：\n${message}`);
}

async function requestJson(url, init) {
  const response = await fetch(url, init);
  const text = await response.text();
  const payload = text ? JSON.parse(text) : null;

  if (!response.ok) {
    const message = typeof payload?.message === 'string' ? payload.message : `请求失败: ${response.status}`;
    throw new Error(message);
  }

  return payload;
}

async function waitForSidecarAddress(child) {
  return await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new RuntimeSmokeError('unknown', `sidecar 启动超时。\n${runtimeContext.sidecarLogs}`));
    }, 15000);

    child.once('exit', (code) => {
      clearTimeout(timeout);
      reject(new RuntimeSmokeError('unknown', `sidecar 提前退出: ${code ?? 'unknown'}\n${runtimeContext.sidecarLogs}`));
    });

    child.stdout.on('data', (chunk) => {
      const text = chunk.toString();
      const match = text.match(/http:\/\/127\.0\.0\.1:\d+/);
      if (!match) {
        return;
      }
      clearTimeout(timeout);
      resolve(match[0]);
    });
  });
}

async function cleanup() {
  if (runtimeContext.composeFile) {
    const down = spawnSync('docker', ['--context', runtimeContext.dockerContext, 'compose', '-f', runtimeContext.composeFile, '-p', runtimeContext.slug, 'down', '-v', '--remove-orphans'], {
      cwd: ROOT_DIR,
      encoding: 'utf8',
    });
    if (down.status !== 0 && (down.stderr || down.stdout).trim()) {
      console.warn(`清理容器失败：${(down.stderr || down.stdout).trim()}`);
    }
  }

  if (runtimeContext.sidecar) {
    runtimeContext.sidecar.kill('SIGTERM');
    await delay(500);
    if (!runtimeContext.sidecar.killed) {
      runtimeContext.sidecar.kill('SIGKILL');
    }
  }

  if (runtimeContext.appDataDir) {
    await fs.rm(runtimeContext.appDataDir, { recursive: true, force: true });
  }
}

function normalizeError(error) {
  if (error instanceof RuntimeSmokeError) {
    return {
      label: ERROR_LABELS[error.code] ?? error.code,
      message: error.message,
      exitCode: EXIT_CODES[error.code] ?? EXIT_CODES.unknown,
    };
  }

  return {
    label: 'unknown',
    message: error instanceof Error ? error.stack ?? error.message : String(error),
    exitCode: EXIT_CODES.unknown,
  };
}

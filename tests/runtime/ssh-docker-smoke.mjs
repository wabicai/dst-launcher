import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { setTimeout as delay } from 'node:timers/promises';
import { createDefaultClusterConfig } from '../../packages/shared/dist/index.js';

const ROOT_DIR = '/Volumes/ai-work/dst-launcher';
const SIDECAR_ENTRY = path.join(ROOT_DIR, 'apps/sidecar/dist/index.cjs');

const runtimeContext = {
  appDataDir: '',
  projectId: '',
  slug: '',
  remotePath: '',
  requiredPorts: [],
  sidecar: null,
  sidecarBaseUrl: '',
  sidecarLogs: '',
  logLines: [],
};

const sshConfig = {
  host: requiredEnv('DST_RUNTIME_SSH_HOST'),
  username: requiredEnv('DST_RUNTIME_SSH_USER'),
  privateKeyPath: requiredEnv('DST_RUNTIME_SSH_KEY'),
  port: Number(process.env.DST_RUNTIME_SSH_PORT || '22'),
};

const clusterToken = requiredEnv('DST_KLEI_TOKEN');

try {
  runtimeContext.appDataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'dst-launcher-ssh-runtime-'));
  runtimeContext.sidecar = spawn(process.execPath, [SIDECAR_ENTRY, '--port', '0', '--app-data', runtimeContext.appDataDir], {
    cwd: ROOT_DIR,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  runtimeContext.sidecar.stderr.on('data', (chunk) => {
    runtimeContext.sidecarLogs += chunk.toString();
  });

  runtimeContext.sidecarBaseUrl = await waitForSidecarAddress(runtimeContext.sidecar);

  const slug = `ssh-${Date.now().toString(36)}`;
  runtimeContext.slug = slug;
  const remoteHome = await runSsh('printf %s "$HOME"');
  runtimeContext.remotePath = `${remoteHome}/dst-launcher/${slug}`;

  const clusterConfig = createDefaultClusterConfig(`SSH Runtime ${slug}`);
  clusterConfig.clusterToken = clusterToken;
  const [p1, p2, p3, p4, p5, p6] = pickRemotePorts();
  runtimeContext.requiredPorts = [p1, p2, p3, p4, p5, p6];
  clusterConfig.master.serverPort = p1;
  clusterConfig.master.masterServerPort = p2;
  clusterConfig.master.authenticationPort = p3;
  clusterConfig.caves.serverPort = p4;
  clusterConfig.caves.masterServerPort = p5;
  clusterConfig.caves.authenticationPort = p6;

  const target = {
    type: 'ssh',
    host: sshConfig.host,
    port: sshConfig.port,
    username: sshConfig.username,
    privateKeyPath: sshConfig.privateKeyPath,
    remotePath: runtimeContext.remotePath,
  };

  const testResult = await requestJson(`${runtimeContext.sidecarBaseUrl}/targets/test`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ target }),
  });
  if (!testResult.ok) {
    throw new Error(testResult.detail || testResult.message || 'SSH 目标测试失败');
  }

  const createdProject = await requestJson(`${runtimeContext.sidecarBaseUrl}/projects`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      name: `SSH Runtime ${slug}`,
      slug,
      description: '远程 VPS 真实验证',
      target,
      clusterConfig,
    }),
  });
  runtimeContext.projectId = createdProject.id;

  const portTask = await runActionAndLoadTask('check-ports');
  if (portTask.message.includes('占用')) {
    throw new Error(`远程端口检查失败：\n${portTask.message}`);
  }

  const firewallTask = await runActionAndLoadTask('ensure-firewall');
  console.log(`防火墙处理结果: ${firewallTask.message}`);
  await assertRemoteFirewallReady();

  await runActionAndLoadTask('deploy');
  await runActionAndLoadTask('start');
  await waitForRunningContainers();
  const firstLogLine = await readRemoteLogs();
  console.log(`收到远程运行日志: ${firstLogLine}`);

  await runActionAndLoadTask('stop');
  await runActionAndLoadTask('backup');
  const detail = await getProjectDetail();
  const backup = detail.backups[0];
  if (!backup?.location) {
    throw new Error('远程备份任务完成，但没有生成备份记录');
  }

  const remoteFileCheck = await runSsh(`test -f ${shellEscape(backup.location)} && echo ok`);
  if (!remoteFileCheck.includes('ok')) {
    throw new Error(`远程备份文件不存在：${backup.location}`);
  }

  console.log('远程 VPS 真实验证通过：deploy -> start -> logs -> stop -> backup');
} finally {
  await cleanup();
}

function requiredEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`缺少环境变量 ${name}`);
  }
  return value;
}

function pickRemotePorts() {
  const base = 24000 + Math.floor(Math.random() * 10000);
  return [base, base + 1, base + 2, base + 3, base + 4, base + 5];
}

async function runActionAndLoadTask(action) {
  await requestJson(`${runtimeContext.sidecarBaseUrl}/projects/${runtimeContext.projectId}/actions/${action}`, {
    method: 'POST',
  });
  const detail = await getProjectDetail();
  const task = detail.tasks.find((item) => item.action === action);
  if (!task) {
    throw new Error(`未找到 ${action} 的任务记录`);
  }
  if (task.status !== 'success') {
    throw new Error(task.message || `${action} 执行失败`);
  }
  return task;
}

async function getProjectDetail() {
  return await requestJson(`${runtimeContext.sidecarBaseUrl}/projects/${runtimeContext.projectId}`);
}

async function waitForRunningContainers() {
  const startedAt = Date.now();
  while (Date.now() - startedAt < 120000) {
    const detail = await getProjectDetail();
    const runningContainers = detail.runtime.containers.filter((item) => item.state === 'running');
    if (runningContainers.length >= 2) {
      return;
    }
    await delay(3000);
  }
  throw new Error('远程容器没有在限定时间内保持运行');
}

async function assertRemoteFirewallReady() {
  const detail = await getProjectDetail();
  if (detail.network.firewallProvider !== 'ufw') {
    throw new Error(`远程防火墙提供方异常：${detail.network.firewallProvider}`);
  }
  if (detail.network.missingUdpPorts.length > 0) {
    throw new Error(`仍有 UDP 端口未放通：${detail.network.missingUdpPorts.join(', ')}`);
  }

  const ufwStatus = await runSsh('ufw status');
  for (const port of runtimeContext.requiredPorts) {
    if (!new RegExp(`(^|\\s)${port}/udp\\s+ALLOW`, 'i').test(ufwStatus)) {
      throw new Error(`UFW 中缺少 ${port}/udp 规则`);
    }
  }
}

async function readRemoteLogs() {
  const logs = await runSsh([
    `cd ${shellEscape(path.posix.join(runtimeContext.remotePath, 'compose'))}`,
    `docker compose -f docker-compose.yml -p ${shellEscape(runtimeContext.slug)} logs --tail 80`,
  ].join(' && '));

  const line = logs
    .split(/\r?\n/)
    .map((entry) => entry.trim())
    .find(Boolean);

  if (!line) {
    throw new Error('远程日志为空，未能验证日志链路');
  }

  runtimeContext.logLines.push(line);
  return line;
}

async function requestJson(url, init) {
  const response = await fetch(url, init);
  const text = await response.text();
  const payload = text ? JSON.parse(text) : null;
  if (!response.ok) {
    throw new Error(typeof payload?.message === 'string' ? payload.message : `请求失败: ${response.status}`);
  }
  return payload;
}

async function waitForSidecarAddress(child) {
  return await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error(`sidecar 启动超时\n${runtimeContext.sidecarLogs}`));
    }, 15000);

    child.once('exit', (code) => {
      clearTimeout(timeout);
      reject(new Error(`sidecar 提前退出: ${code ?? 'unknown'}\n${runtimeContext.sidecarLogs}`));
    });

    child.stdout.on('data', (chunk) => {
      const text = chunk.toString();
      const match = text.match(/http:\/\/127\.0\.0\.1:\d+/);
      if (!match) return;
      clearTimeout(timeout);
      resolve(match[0]);
    });
  });
}

async function runSsh(command) {
  const child = spawn('ssh', [
    '-i',
    sshConfig.privateKeyPath,
    '-p',
    String(sshConfig.port),
    '-o',
    'BatchMode=yes',
    `${sshConfig.username}@${sshConfig.host}`,
    command,
  ], {
    cwd: ROOT_DIR,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let stdout = '';
  let stderr = '';
  child.stdout.on('data', (chunk) => {
    stdout += chunk.toString();
  });
  child.stderr.on('data', (chunk) => {
    stderr += chunk.toString();
  });

  const code = await new Promise((resolve) => child.on('close', resolve));
  if (code !== 0) {
    throw new Error(stderr || stdout || `SSH 命令失败: ${command}`);
  }
  return stdout.trim();
}

async function cleanup() {
  if (runtimeContext.projectId && runtimeContext.remotePath) {
    try {
      await runSsh([
        `if [ -d ${shellEscape(runtimeContext.remotePath)}/compose ]; then`,
        `cd ${shellEscape(runtimeContext.remotePath)}/compose && docker compose -f docker-compose.yml -p ${shellEscape(runtimeContext.slug)} down -v --remove-orphans || true;`,
        'fi',
        `rm -rf ${shellEscape(runtimeContext.remotePath)}`,
      ].join(' '));
    } catch {
      // ignore remote cleanup failure
    }
  }

  if (runtimeContext.sidecar) {
    runtimeContext.sidecar.kill('SIGTERM');
    await delay(500);
  }

  if (runtimeContext.appDataDir) {
    await fs.rm(runtimeContext.appDataDir, { recursive: true, force: true });
  }
}

function shellEscape(value) {
  return `'${String(value).replace(/'/g, `'\\''`)}'`;
}

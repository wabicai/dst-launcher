import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createDefaultClusterConfig } from '@dst-launcher/shared';

const appDataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'dst-sidecar-smoke-'));
const child = spawn(process.execPath, ['dist/index.cjs', '--port', '0', '--app-data', appDataDir], {
  cwd: new URL('..', import.meta.url),
  stdio: ['ignore', 'pipe', 'pipe'],
});

let stderr = '';
child.stderr.on('data', (chunk) => {
  stderr += chunk.toString();
});

try {
  const baseUrl = await waitForAddress(child);

  const health = await requestJson(`${baseUrl}/health`);
  assert.equal(health.ok, true);
  assert.equal(health.service, 'dst-launcher-sidecar');

  const targetTest = await requestJson(`${baseUrl}/targets/test`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      target: {
        type: 'ssh',
        host: '127.0.0.1',
        port: 1,
        username: 'invalid',
        privateKeyPath: '/no/such/key',
        remotePath: '~/dst-launcher/smoke-test',
      },
    }),
  });
  assert.equal(targetTest.ok, false);

  const createdProject = await requestJson(`${baseUrl}/projects`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      name: 'Smoke Runtime Project',
      slug: 'smoke-runtime-project',
      description: '通过 sidecar 烟测创建。',
      target: {
        type: 'local',
        dockerContext: 'desktop-linux',
      },
      clusterConfig: createDefaultClusterConfig('Smoke Runtime Project'),
    }),
  });

  assert.ok(createdProject.id);
  assert.equal(createdProject.name, 'Smoke Runtime Project');
  assert.equal(createdProject.clusterConfig.clusterName, 'Smoke Runtime Project');

  const projectDetail = await requestJson(`${baseUrl}/projects/${createdProject.id}`);
  assert.equal(projectDetail.slug, 'smoke-runtime-project');
  assert.equal(projectDetail.target.type, 'local');
  assert.equal(projectDetail.network.status, 'not_applicable');
  // Docker (local) targets use fixed ports from the wollwolke/dst-dedicated-server image
  assert.deepEqual(projectDetail.network.requiredUdpPorts.sort((left, right) => left - right), [8766, 8767, 10999, 11000, 27016, 27017]);

  console.log('sidecar smoke test passed');
} finally {
  child.kill();
  await fs.rm(appDataDir, { recursive: true, force: true });
}

async function requestJson(url, init) {
  const response = await fetch(url, init);
  const data = await response.json();
  assert.ok(response.ok, `请求失败: ${response.status} ${JSON.stringify(data)}`);
  return data;
}

async function waitForAddress(childProcess) {
  return await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error(`sidecar 启动超时${stderr ? `\n${stderr}` : ''}`));
    }, 10000);

    childProcess.once('exit', (code) => {
      clearTimeout(timeout);
      reject(new Error(`sidecar 提前退出: ${code ?? 'unknown'}${stderr ? `\n${stderr}` : ''}`));
    });

    childProcess.stdout.on('data', (chunk) => {
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

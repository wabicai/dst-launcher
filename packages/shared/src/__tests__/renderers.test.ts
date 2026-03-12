import { describe, expect, it } from 'vitest';
import {
  createDefaultClusterConfig,
  LogEventSchema,
  ProjectActionSchema,
  ProjectDetailSchema,
  renderClusterIni,
  renderConfigPreview,
  renderComposeFile,
  TaskEventSchema,
} from '@dst-launcher/shared';

describe('配置渲染器', () => {
  it('可以生成 cluster.ini 与 server.ini 预览', () => {
    const config = createDefaultClusterConfig('测试房间');
    const preview = renderConfigPreview(config);

    expect(renderClusterIni(config)).toContain('cluster_name = 测试房间');
    expect(preview['Master/server.ini']).toContain('is_master = true');
    expect(preview['Caves/server.ini']).toContain('name = Caves');
  });

  it('可以生成 compose 文件', () => {
    const compose = renderComposeFile({
      slug: 'demo-dst',
      clusterConfig: createDefaultClusterConfig('Demo'),
    });

    expect(compose).toContain('dst-master');
    expect(compose).toContain('dst-caves');
    expect(compose).toContain('dst-updater');
  });
});

describe('事件 schema', () => {
  it('可以序列化任务事件与日志事件', () => {
    const taskEvent = TaskEventSchema.parse({
      type: 'task.started',
      projectId: 'p1',
      taskId: 't1',
      action: 'deploy',
      message: '开始部署',
      timestamp: new Date().toISOString(),
    });

    const logEvent = LogEventSchema.parse({
      type: 'log.line',
      projectId: 'p1',
      line: 'hello',
      stream: 'system',
      timestamp: new Date().toISOString(),
    });

    expect(taskEvent.type).toBe('task.started');
    expect(logEvent.type).toBe('log.line');
  });

  it('可以识别 ensure-firewall 动作与 network 字段', () => {
    expect(ProjectActionSchema.parse('ensure-firewall')).toBe('ensure-firewall');

    const detail = ProjectDetailSchema.parse({
      id: 'project_1',
      name: 'Remote Demo',
      slug: 'remote-demo',
      description: '',
      status: 'idle',
      target: {
        type: 'ssh',
        host: 'example.com',
        port: 22,
        username: 'root',
        privateKeyPath: '~/.ssh/id_ed25519',
        remotePath: '~/dst-launcher/remote-demo',
      },
      clusterConfig: createDefaultClusterConfig('Remote Demo'),
      backups: [],
      tasks: [],
      deployment: null,
      network: {
        requiredUdpPorts: [10999, 11000, 12346, 12347, 8768, 8769],
        firewallProvider: 'ufw',
        firewallSupported: true,
        openUdpPorts: [10999, 11000],
        missingUdpPorts: [12346, 12347, 8768, 8769],
        status: 'needs_attention',
        detail: '仍有端口未放通',
      },
      runtime: {
        dockerAvailable: true,
        containers: [],
      },
    });

    expect(detail.network.firewallProvider).toBe('ufw');
    expect(detail.network.missingUdpPorts).toHaveLength(4);
  });
});

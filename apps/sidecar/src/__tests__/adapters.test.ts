import { describe, expect, it } from 'vitest';
import { SshDockerAdapter } from '../adapters/ssh-docker';

describe('SshDockerAdapter', () => {
  it('连接失败时会返回失败结果', async () => {
    const adapter = new SshDockerAdapter({
      type: 'ssh',
      host: '127.0.0.1',
      port: 1,
      username: 'invalid',
      privateKeyPath: '/no/such/key',
      remotePath: '~/dst-launcher/test',
    });

    const result = await adapter.testConnection();
    expect(result.ok).toBe(false);
  });
});

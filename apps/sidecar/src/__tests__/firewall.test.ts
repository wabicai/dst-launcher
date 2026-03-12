import { describe, expect, it } from 'vitest';
import {
  createLocalNetworkStatus,
  createUfwNetworkStatus,
  createUnsupportedNetworkStatus,
  normalizeUdpPorts,
  parseUfwStatusOutput,
} from '../adapters/firewall';

describe('firewall helpers', () => {
  it('会去重并排序 UDP 端口', () => {
    expect(normalizeUdpPorts([11000, 10999, 11000, 8768])).toEqual([8768, 10999, 11000]);
  });

  it('可以解析 UFW status 输出中的 UDP 规则', () => {
    const parsed = parseUfwStatusOutput(`Status: active

To                         Action      From
--                         ------      ----
22/tcp                     ALLOW       Anywhere
10999/udp                  ALLOW       Anywhere                   # DST Launcher demo
11000/udp                  ALLOW       Anywhere
`);

    expect(parsed.active).toBe(true);
    expect(parsed.openUdpPorts).toEqual([10999, 11000]);
  });

  it('会在 UFW 缺口存在时标记 needs_attention', () => {
    const status = createUfwNetworkStatus([10999, 11000, 12346], `Status: active

To                         Action      From
--                         ------      ----
10999/udp                  ALLOW       Anywhere
`);

    expect(status.firewallProvider).toBe('ufw');
    expect(status.firewallSupported).toBe(true);
    expect(status.status).toBe('needs_attention');
    expect(status.openUdpPorts).toEqual([10999]);
    expect(status.missingUdpPorts).toEqual([11000, 12346]);
  });

  it('会在 UFW inactive 时视为 ready', () => {
    const status = createUfwNetworkStatus([10999, 11000], 'Status: inactive');

    expect(status.status).toBe('ready');
    expect(status.openUdpPorts).toEqual([10999, 11000]);
    expect(status.missingUdpPorts).toEqual([]);
  });

  it('本地与不支持场景会生成明确状态', () => {
    const local = createLocalNetworkStatus([12346, 10999]);
    const unsupported = createUnsupportedNetworkStatus([10999], '当前目标未安装 UFW');

    expect(local.status).toBe('not_applicable');
    expect(local.requiredUdpPorts).toEqual([10999, 12346]);
    expect(unsupported.status).toBe('unsupported');
    expect(unsupported.missingUdpPorts).toEqual([10999]);
  });
});

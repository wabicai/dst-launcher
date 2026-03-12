import type { ProjectNetwork } from '@dst-launcher/shared';

export function normalizeUdpPorts(ports: number[]) {
  return [...new Set(ports)].sort((left, right) => left - right);
}

export function createLocalNetworkStatus(ports: number[]): ProjectNetwork {
  const requiredUdpPorts = normalizeUdpPorts(ports);
  return {
    requiredUdpPorts,
    firewallProvider: 'none',
    firewallSupported: false,
    openUdpPorts: [],
    missingUdpPorts: [],
    status: 'not_applicable',
    detail: '本地模式不需要调整 VPS 防火墙；Docker Compose 会直接绑定这些 UDP 端口。',
  };
}

export function createUnsupportedNetworkStatus(ports: number[], detail: string): ProjectNetwork {
  return {
    requiredUdpPorts: normalizeUdpPorts(ports),
    firewallProvider: 'unknown',
    firewallSupported: false,
    openUdpPorts: [],
    missingUdpPorts: normalizeUdpPorts(ports),
    status: 'unsupported',
    detail,
  };
}

export function createUnknownNetworkStatus(ports: number[], detail: string): ProjectNetwork {
  return {
    requiredUdpPorts: normalizeUdpPorts(ports),
    firewallProvider: 'unknown',
    firewallSupported: false,
    openUdpPorts: [],
    missingUdpPorts: normalizeUdpPorts(ports),
    status: 'unknown',
    detail,
  };
}

export function parseUfwStatusOutput(stdout: string) {
  const openUdpPorts = new Set<number>();
  const active = !/Status:\s+inactive/i.test(stdout);

  for (const line of stdout.split(/\r?\n/)) {
    const match = line.match(/(^|\s)(\d+)\/udp\s+ALLOW/i);
    if (!match) {
      continue;
    }
    openUdpPorts.add(Number(match[2]));
  }

  return {
    active,
    openUdpPorts: [...openUdpPorts].sort((left, right) => left - right),
  };
}

export function createUfwNetworkStatus(ports: number[], stdout: string): ProjectNetwork {
  const requiredUdpPorts = normalizeUdpPorts(ports);
  const parsed = parseUfwStatusOutput(stdout);
  const openUdpPorts = parsed.openUdpPorts.filter((port) => requiredUdpPorts.includes(port));
  const missingUdpPorts = requiredUdpPorts.filter((port) => !openUdpPorts.includes(port));

  if (!parsed.active) {
    return {
      requiredUdpPorts,
      firewallProvider: 'ufw',
      firewallSupported: true,
      openUdpPorts: requiredUdpPorts,
      missingUdpPorts: [],
      status: 'ready',
      detail: '远端检测到 UFW，但当前处于 inactive；若云安全组未拦截 UDP，这些端口可直接使用。',
    };
  }

  if (missingUdpPorts.length === 0) {
    return {
      requiredUdpPorts,
      firewallProvider: 'ufw',
      firewallSupported: true,
      openUdpPorts,
      missingUdpPorts,
      status: 'ready',
      detail: 'UFW 已放通当前项目所需的全部 UDP 端口。',
    };
  }

  return {
    requiredUdpPorts,
    firewallProvider: 'ufw',
    firewallSupported: true,
    openUdpPorts,
    missingUdpPorts,
    status: 'needs_attention',
    detail: `UFW 已开启，但以下 UDP 端口尚未放通：${missingUdpPorts.join(', ')}`,
  };
}

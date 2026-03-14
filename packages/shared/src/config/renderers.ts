import type { ClusterConfig, ShardConfig } from '../schemas/project';
import { formatIniValue } from '../utils/format';

function section(title: string, values: Record<string, string | number | boolean>): string {
  const lines = Object.entries(values).map(([key, value]) => `${key} = ${formatIniValue(value)}`);
  return [`[${title}]`, ...lines, ''].join('\n');
}

export function renderClusterIni(
  config: ClusterConfig,
  options?: { masterIp?: string },
): string {
  return [
    section('GAMEPLAY', {
      game_mode: config.gameMode,
      max_players: config.maxPlayers,
      pvp: config.pvp,
      pause_when_empty: config.pauseWhenEmpty,
    }),
    section('NETWORK', {
      cluster_name: config.clusterName,
      cluster_description: config.clusterDescription,
      cluster_password: config.clusterPassword,
      cluster_intention: config.clusterIntention,
      offline_cluster: config.offlineCluster,
      lan_only_cluster: false,
    }),
    section('MISC', {
      console_enabled: true,
    }),
    section('SHARD', {
      shard_enabled: true,
      bind_ip: '0.0.0.0',
      master_ip: options?.masterIp ?? '127.0.0.1',
      cluster_key: 'dst-launcher-default-key',
    }),
  ]
    .join('\n')
    .trim();
}

export function renderShardServerIni(
  shard: ShardConfig,
  options?: { masterIp?: string; masterPort?: number },
): string {
  const shardValues: Record<string, string | number | boolean> = {
    is_master: shard.isMaster,
    name: shard.shardName,
  };

  if (!shard.isMaster && options?.masterIp) {
    shardValues.master_ip = options.masterIp;
    if (options.masterPort !== undefined) {
      shardValues.master_port = options.masterPort;
    }
  }

  return [
    section('NETWORK', {
      server_port: shard.serverPort,
      bind_ip: shard.bindIp,
    }),
    section('SHARD', shardValues),
    section('STEAM', {
      master_server_port: shard.masterServerPort,
      authentication_port: shard.authenticationPort,
    }),
    section('ACCOUNT', {
      encode_user_path: true,
    }),
  ]
    .join('\n')
    .trim();
}

export function renderModoverrides(workshopIds: string[]): string {
  if (workshopIds.length === 0) {
    return 'return {}\n';
  }
  const lines = workshopIds
    .map((id) => id.trim())
    .filter((id) => /^\d+$/.test(id))
    .map((id) => `  ["workshop-${id}"] = { enabled = true },`);
  return `return {\n${lines.join('\n')}\n}\n`;
}

export function renderWorldgenOverride(preset: string): string {
  return `return {\n  override_enabled = true,\n  preset = "${preset}",\n  overrides = {}\n}\n`;
}

export function renderAdminList(config: ClusterConfig): string {
  const ids = config.adminIds.map((id) => id.trim()).filter(Boolean);
  return ids.length > 0 ? `${ids.join('\n')}\n` : '';
}

export function renderModsSetup(config: ClusterConfig): string {
  const lines: string[] = [
    '-- 由 DST Launcher 自动生成',
  ];

  if (config.modCollection.trim() && /^\d+$/.test(config.modCollection.trim())) {
    lines.push(`ServerModCollectionSetup("${config.modCollection.trim()}")`);
  }

  for (const modId of config.modIds) {
    const normalized = modId.trim();
    if (!normalized) continue;
    if (!/^\d+$/.test(normalized)) continue;
    lines.push(`ServerModSetup("${normalized}")`);
  }

  return `${lines.join('\n')}\n`;
}

export function renderConfigPreview(
  config: ClusterConfig,
  options?: { targetType?: 'local' | 'ssh' | 'native' },
) {
  const cavesMasterIp = options?.targetType === 'native' ? '127.0.0.1' : 'dst_master';
  return {
    'cluster.ini': renderClusterIni(config, { masterIp: cavesMasterIp }),
    'cluster_token.txt': config.clusterToken,
    'Master/server.ini': renderShardServerIni(config.master),
    'Caves/server.ini': renderShardServerIni(config.caves, {
      masterIp: cavesMasterIp,
      masterPort: config.master.masterServerPort,
    }),
    'Master/worldgenoverride.lua': renderWorldgenOverride(config.masterWorldPreset),
    'Caves/worldgenoverride.lua': renderWorldgenOverride(config.cavesWorldPreset),
    'dedicated_server_mods_setup.lua': renderModsSetup(config),
    'Master/modoverrides.lua': renderModoverrides(config.modIds),
    'Caves/modoverrides.lua': renderModoverrides(config.modIds),
    'adminlist.txt': renderAdminList(config),
  };
}

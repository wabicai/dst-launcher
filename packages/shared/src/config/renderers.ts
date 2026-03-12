import type { ClusterConfig, ShardConfig } from '../schemas/project';
import { formatIniValue } from '../utils/format';

function section(title: string, values: Record<string, string | number | boolean>): string {
  const lines = Object.entries(values).map(([key, value]) => `${key} = ${formatIniValue(value)}`);
  return [`[${title}]`, ...lines, ''].join('\n');
}

export function renderClusterIni(config: ClusterConfig): string {
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

export function renderAdminList(config: ClusterConfig): string {
  const ids = config.adminIds.map((id) => id.trim()).filter(Boolean);
  return ids.length > 0 ? `${ids.join('\n')}\n` : '';
}

export function renderModsSetup(config: ClusterConfig): string {
  const lines: string[] = [
    '-- 由 DST Launcher 自动生成',
  ];

  if (config.modCollection.trim()) {
    lines.push(`ServerModCollectionSetup(\"${config.modCollection.trim()}\")`);
  }

  for (const modId of config.modIds) {
    const normalized = modId.trim();
    if (!normalized) continue;
    lines.push(`ServerModSetup(\"${normalized}\")`);
  }

  return `${lines.join('\n')}\n`;
}

export function renderConfigPreview(config: ClusterConfig) {
  return {
    'cluster.ini': renderClusterIni(config),
    'cluster_token.txt': config.clusterToken,
    'Master/server.ini': renderShardServerIni(config.master),
    'Caves/server.ini': renderShardServerIni(config.caves, {
      masterIp: 'dst-master',
      masterPort: config.master.masterServerPort,
    }),
    'dedicated_server_mods_setup.lua': renderModsSetup(config),
    'adminlist.txt': renderAdminList(config),
  };
}

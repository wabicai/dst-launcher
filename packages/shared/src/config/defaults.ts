import type { ClusterConfig, ProjectCreateInput, TargetConfig } from '../schemas/project';
import { DEFAULT_PROJECT_NAME, DEFAULT_PROJECT_SLUG } from '../utils/project';

export function createDefaultTargetConfig(): TargetConfig {
  return {
    type: 'local',
    dockerContext: 'desktop-linux',
  };
}

export function createDefaultClusterConfig(projectName = DEFAULT_PROJECT_NAME): ClusterConfig {
  return {
    clusterName: projectName,
    clusterDescription: '由 DST Launcher 创建',
    clusterPassword: '',
    clusterToken: '',
    clusterIntention: 'cooperative',
    gameMode: 'survival',
    maxPlayers: 6,
    pvp: false,
    pauseWhenEmpty: true,
    offlineCluster: false,
    modCollection: '',
    modIds: [],
    adminIds: [],
    masterWorldPreset: 'SURVIVAL_TOGETHER',
    cavesWorldPreset: 'DST_CAVE',
    master: {
      shardName: 'Master',
      isMaster: true,
      bindIp: '0.0.0.0',
      serverPort: 10999,
      masterServerPort: 12346,
      authenticationPort: 8768,
    },
    caves: {
      shardName: 'Caves',
      isMaster: false,
      bindIp: '0.0.0.0',
      serverPort: 11000,
      masterServerPort: 12347,
      authenticationPort: 8769,
    },
  };
}

export function createDefaultProjectInput(): ProjectCreateInput {
  return {
    name: DEFAULT_PROJECT_NAME,
    slug: DEFAULT_PROJECT_SLUG,
    description: '',
    target: createDefaultTargetConfig(),
    clusterConfig: createDefaultClusterConfig(DEFAULT_PROJECT_NAME),
  };
}

import type { ClusterConfig } from '../schemas/project';

export interface ComposeGenerationInput {
  slug: string;
  clusterConfig: ClusterConfig;
  /** When true, the launcher.sh entrypoint skips the SteamCMD app_update step. */
  skipUpdate?: boolean;
}

export function renderComposeFile(input: ComposeGenerationInput): string {
  const { slug, clusterConfig, skipUpdate = true } = input;
  const skipUpdateValue = skipUpdate ? '1' : '0';

  return `name: ${slug}
services:
  dst_master:
    image: wollwolke/dst-dedicated-server:latest
    platform: linux/amd64
    container_name: ${slug}_dst_master
    restart: unless-stopped
    stdin_open: true
    tty: true
    dns:
      - 8.8.8.8
      - 8.8.4.4
    environment:
      CLUSTER_NAME: ${yamlString(clusterConfig.clusterName)}
      CLUSTER_DESCRIPTION: ${yamlString(clusterConfig.clusterDescription)}
      CLUSTER_PW: ${yamlString(clusterConfig.clusterPassword)}
      CLUSTER_TOKEN: ${yamlString(clusterConfig.clusterToken)}
      GAME_MODE: ${yamlString(clusterConfig.gameMode)}
      CLUSTER_INTENTION: ${yamlString(clusterConfig.clusterIntention)}
      MAX_PLAYERS: ${clusterConfig.maxPlayers}
      PVP: ${yamlBoolean(clusterConfig.pvp)}
      PAUSE_WHEN_EMPTY: ${yamlBoolean(clusterConfig.pauseWhenEmpty)}
      SHARD_NAME: ${yamlString(clusterConfig.master.shardName)}
      SHARD_IS_MASTER: true
      KEEP_CLUSTER_CONFIG: true
      CPU_MHZ: 1000
      SKIP_UPDATE: "${skipUpdateValue}"
    ports:
      - '11000:11000/udp'
      - '27016:27016/udp'
      - '8766:8766/udp'
    entrypoint: ['/bin/bash', '/home/dst/config/launcher.sh']
    command: []
    volumes:
      - ../data/server:/home/dst/dst_server
      - ../data/cluster:/data
      - ../config/launcher.sh:/home/dst/config/launcher.sh
      - ../config/mods_setup.lua:/home/dst/config/mods_setup.lua
    healthcheck:
      test: ['CMD-SHELL', 'test -d /data/${clusterConfig.clusterName}']
      interval: 30s
      timeout: 10s
      retries: 3

  dst_caves:
    image: wollwolke/dst-dedicated-server:latest
    platform: linux/amd64
    container_name: ${slug}_dst_caves
    restart: unless-stopped
    stdin_open: true
    tty: true
    dns:
      - 8.8.8.8
      - 8.8.4.4
    depends_on:
      dst_master:
        condition: service_healthy
    environment:
      CLUSTER_NAME: ${yamlString(clusterConfig.clusterName)}
      CLUSTER_DESCRIPTION: ${yamlString(clusterConfig.clusterDescription)}
      CLUSTER_PW: ${yamlString(clusterConfig.clusterPassword)}
      CLUSTER_TOKEN: ${yamlString(clusterConfig.clusterToken)}
      GAME_MODE: ${yamlString(clusterConfig.gameMode)}
      CLUSTER_INTENTION: ${yamlString(clusterConfig.clusterIntention)}
      MAX_PLAYERS: ${clusterConfig.maxPlayers}
      PVP: ${yamlBoolean(clusterConfig.pvp)}
      PAUSE_WHEN_EMPTY: ${yamlBoolean(clusterConfig.pauseWhenEmpty)}
      SHARD_NAME: ${yamlString(clusterConfig.caves.shardName)}
      SHARD_IS_MASTER: false
      KEEP_CLUSTER_CONFIG: true
      CPU_MHZ: 1000
      SKIP_UPDATE: "${skipUpdateValue}"
    ports:
      - '10999:10999/udp'
      - '27017:27016/udp'
      - '8767:8766/udp'
    entrypoint: ['/bin/bash', '/home/dst/config/launcher.sh']
    command: []
    volumes:
      - ../data/server:/home/dst/dst_server
      - ../data/cluster:/data
      - ../config/launcher.sh:/home/dst/config/launcher.sh
      - ../config/mods_setup.lua:/home/dst/config/mods_setup.lua

  dst-updater:
    image: alpine:3.21
    container_name: ${slug}_dst_updater
    profiles: ['maintenance']
    command: ['sh', '-lc', 'echo "DST 更新通过 docker compose pull && up -d --force-recreate 完成"']
`;
}

function yamlString(value: string): string {
  return JSON.stringify(value);
}

function yamlBoolean(value: boolean): 'true' | 'false' {
  return value ? 'true' : 'false';
}

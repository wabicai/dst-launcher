import type { ClusterConfig } from '../schemas/project';

export interface ComposeGenerationInput {
  slug: string;
  clusterConfig: ClusterConfig;
}

export function renderComposeFile(input: ComposeGenerationInput): string {
  const { slug, clusterConfig } = input;
  const modCollection = clusterConfig.modCollection.trim();

  return `name: ${slug}
services:
  dst_master:
    image: wollwolke/dst-dedicated-server:latest
    platform: linux/amd64
    container_name: ${slug}_dst_master
    restart: unless-stopped
    stdin_open: true
    tty: true
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
      MOD_COLLECTION: ${yamlString(modCollection)}
      CPU_MHZ: 1000
    ports:
      - '${clusterConfig.master.serverPort}:${clusterConfig.master.serverPort}/udp'
      - '${clusterConfig.master.masterServerPort}:${clusterConfig.master.masterServerPort}/udp'
      - '${clusterConfig.master.authenticationPort}:${clusterConfig.master.authenticationPort}/udp'
    volumes:
      - ../data/server:/home/dst/dst_server
      - ../data/cluster:/data
    healthcheck:
      test: ['CMD-SHELL', 'test -d /data']
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
    depends_on:
      dst_master:
        condition: service_started
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
      MOD_COLLECTION: ${yamlString(modCollection)}
      CPU_MHZ: 1000
    ports:
      - '${clusterConfig.caves.serverPort}:${clusterConfig.caves.serverPort}/udp'
      - '${clusterConfig.caves.masterServerPort}:${clusterConfig.caves.masterServerPort}/udp'
      - '${clusterConfig.caves.authenticationPort}:${clusterConfig.caves.authenticationPort}/udp'
    volumes:
      - ../data/server:/home/dst/dst_server
      - ../data/cluster:/data

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

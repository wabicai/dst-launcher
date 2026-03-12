import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Fastify from 'fastify';
import websocket from '@fastify/websocket';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createDefaultClusterConfig, type ModImportResult, type ModRecommendationBundle, type ModSearchResponse } from '@dst-launcher/shared';
import { createDatabase } from '../db/client';
import { ProjectRepository } from '../db/repository';
import { LocalDockerAdapter } from '../adapters/local-docker';
import { registerRoutes } from '../routes/register';
import { EventBus } from '../services/event-bus';
import { ProjectService } from '../services/project-service';
import { resolveAppPaths } from '../utils/paths';

describe('模组管理路由', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dst-launcher-routes-'));
  });

  afterEach(() => {
    vi.restoreAllMocks();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('可以搜索、导入、保存并触发预拉取', async () => {
    vi.spyOn(LocalDockerAdapter.prototype, 'testConnection').mockResolvedValue({
      ok: true,
      message: 'ok',
      detail: '',
    });
    vi.spyOn(LocalDockerAdapter.prototype, 'composePs').mockResolvedValue([]);
    vi.spyOn(LocalDockerAdapter.prototype, 'inspectNetwork').mockResolvedValue({
      requiredUdpPorts: [10999, 11000, 12346, 12347, 8768, 8769],
      firewallProvider: 'none',
      firewallSupported: false,
      openUdpPorts: [],
      missingUdpPorts: [],
      status: 'not_applicable',
      detail: '本地模式无需额外开放 VPS UDP 端口。',
    });
    vi.spyOn(LocalDockerAdapter.prototype, 'prefetchMods').mockImplementation(async (_composeFile, _slug, callbacks) => {
      callbacks.onStdout?.('prefetch stdout');
      return 'prefetch done';
    });

    const fakeSearch: ModSearchResponse = {
      query: 'geo',
      page: 1,
      hasMore: false,
      items: [
        {
          workshopId: '351325790',
          type: 'mod',
          title: 'Geometric Placement',
          author: 'Rezecib',
          description: '',
          previewUrl: '',
          sourceUrl: 'https://steamcommunity.com/sharedfiles/filedetails/?id=351325790',
          tags: ['Utility'],
          updatedAt: new Date().toISOString(),
          subscriptions: 10,
          favorited: 2,
          views: 20,
          collectionMemberIds: [],
        },
      ],
    };
    const fakeImport: ModImportResult = {
      query: '2203354924',
      type: 'collection',
      message: '已解析合集。',
      items: [
        {
          workshopId: '2203354924',
          type: 'collection',
          title: 'Starter Bundle',
          author: '',
          description: '',
          previewUrl: '',
          sourceUrl: 'https://steamcommunity.com/sharedfiles/filedetails/?id=2203354924',
          tags: ['Collection'],
          updatedAt: new Date().toISOString(),
          subscriptions: 10,
          favorited: 2,
          views: 20,
          collectionMemberIds: ['351325790'],
        },
        fakeSearch.items[0]!,
      ],
    };
    const fakeRecommendations: ModRecommendationBundle[] = [
      {
        id: 'light-qol',
        name: '轻量 QoL',
        description: '常用预设',
        items: fakeSearch.items,
      },
    ];

    const fakeProvider = {
      search: vi.fn().mockResolvedValue(fakeSearch),
      import: vi.fn().mockResolvedValue(fakeImport),
      getRecommendations: vi.fn().mockResolvedValue(fakeRecommendations),
      getPublishedFileDetails: vi.fn().mockImplementation(async (ids: string[]) => fakeImport.items.filter((item) => ids.includes(item.workshopId))),
    };

    const db = createDatabase(path.join(tempDir, 'db.sqlite'));
    const repository = new ProjectRepository(db);
    const eventBus = new EventBus();
    const service = new ProjectService(repository, eventBus, resolveAppPaths(tempDir), fakeProvider as never);
    const app = Fastify({ logger: false });
    await app.register(websocket);
    await registerRoutes(app, service, eventBus);

    const createResponse = await app.inject({
      method: 'POST',
      url: '/projects',
      payload: {
        name: 'Mod Test',
        slug: 'mod-test',
        description: '',
        target: {
          type: 'local',
          dockerContext: 'desktop-linux',
        },
        clusterConfig: createDefaultClusterConfig('Mod Test'),
      },
    });

    expect(createResponse.statusCode).toBe(200);
    const created = createResponse.json();
    const projectId = created.id as string;

    const searchResponse = await app.inject({
      method: 'GET',
      url: '/mods/search?q=geo&page=1',
    });
    expect(searchResponse.statusCode).toBe(200);
    expect(searchResponse.json().items[0].title).toBe('Geometric Placement');

    const importResponse = await app.inject({
      method: 'POST',
      url: '/mods/import',
      payload: {
        value: '2203354924',
      },
    });
    expect(importResponse.statusCode).toBe(200);
    expect(importResponse.json().type).toBe('collection');

    const updateResponse = await app.inject({
      method: 'PUT',
      url: `/projects/${projectId}/mods`,
      payload: {
        entries: [
          {
            workshopId: '2203354924',
            type: 'collection',
            source: 'collection',
            enabled: true,
            order: 0,
          },
          {
            workshopId: '351325790',
            type: 'mod',
            source: 'search',
            enabled: true,
            order: 1,
          },
        ],
      },
    });

    expect(updateResponse.statusCode).toBe(200);
    const updated = updateResponse.json();
    expect(updated.collection.workshopId).toBe('2203354924');
    expect(updated.entries).toHaveLength(0);
    expect(updated.preview.modsSetup).toContain('ServerModCollectionSetup("2203354924")');

    const prefetchResponse = await app.inject({
      method: 'POST',
      url: `/projects/${projectId}/actions/prefetch-mods`,
    });

    expect(prefetchResponse.statusCode).toBe(200);
    const detailResponse = await app.inject({
      method: 'GET',
      url: `/projects/${projectId}`,
    });
    expect(detailResponse.statusCode).toBe(200);
    expect(detailResponse.json().modsSummary.prefetch.state).toBe('success');

    await app.close();
  });
});

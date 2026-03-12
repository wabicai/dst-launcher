import { expect, test } from '@playwright/test';

const searchItem = {
  workshopId: '351325790',
  type: 'mod',
  title: 'Geometric Placement',
  author: 'Rezecib',
  description: '',
  previewUrl: '',
  sourceUrl: 'https://steamcommunity.com/sharedfiles/filedetails/?id=351325790',
  tags: ['Utility'],
  updatedAt: '2025-01-01T00:00:00.000Z',
  subscriptions: 10,
  favorited: 2,
  views: 20,
  collectionMemberIds: [],
};

const recommendationItem = {
  workshopId: '666155465',
  type: 'mod',
  title: 'Show Me',
  author: 'star',
  description: '',
  previewUrl: '',
  sourceUrl: 'https://steamcommunity.com/sharedfiles/filedetails/?id=666155465',
  tags: ['Info'],
  updatedAt: '2025-01-02T00:00:00.000Z',
  subscriptions: 20,
  favorited: 4,
  views: 40,
  collectionMemberIds: [],
};

test('模组工作台支持搜索、导入、推荐和预拉取', async ({ page }) => {
  let modsState = createModsState();

  await page.route('**/mods/search**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        query: 'geometric placement',
        page: 1,
        hasMore: false,
        items: [searchItem],
      }),
    });
  });

  await page.route('**/mods/recommendations', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([
        {
          id: 'light-qol',
          name: '轻量 QoL',
          description: '常用预设',
          items: [recommendationItem],
        },
      ]),
    });
  });

  await page.route('**/mods/import', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        query: '2203354924',
        type: 'collection',
        message: '已解析合集 Starter Bundle。',
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
            updatedAt: '2025-01-03T00:00:00.000Z',
            subscriptions: 30,
            favorited: 6,
            views: 60,
            collectionMemberIds: ['351325790'],
          },
          searchItem,
        ],
      }),
    });
  });

  await page.route('**/projects/*/mods', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(modsState),
      });
      return;
    }

    const payload = route.request().postDataJSON() as {
      entries: Array<{
        workshopId: string;
        type: 'mod' | 'collection';
        source: 'search' | 'recommendation' | 'import' | 'collection';
        enabled: boolean;
        order: number;
      }>;
    };

    modsState = createModsState(payload.entries);
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(modsState),
    });
  });

  await page.route('**/projects/*/actions/prefetch-mods', async (route) => {
    modsState = markPrefetchSuccess(modsState);
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ok: true }),
    });
  });

  await page.goto('/projects/new');
  await page.getByTestId('project-name-input').fill('Mods Bench Camp');
  await page.getByTestId('project-submit-button').click();
  await page.waitForURL(/\/project\?id=/);

  await page.getByTestId('mods-tab-trigger').click();
  await expect(page.getByText('模组工作台')).toBeVisible();

  const toolbarInput = page.getByTestId('mods-toolbar-input');
  await toolbarInput.fill('geometric placement');
  await page.getByRole('button', { name: '搜索' }).click();

  await expect(page.getByTestId('mod-search-result-351325790')).toContainText('Geometric Placement');
  await page.getByTestId('mod-search-result-351325790').getByRole('button', { name: '加入项目' }).click();
  await expect(page.getByTestId('mods-selection-list')).toContainText('Geometric Placement');

  await toolbarInput.fill('https://steamcommunity.com/sharedfiles/filedetails/?id=2203354924');
  await page.getByRole('button', { name: '导入' }).click();
  await page.getByRole('button', { name: '加入项目' }).click();
  await expect(page.getByTestId('mods-collection-block')).toContainText('Starter Bundle');
  await expect(page.getByTestId('mods-preview-setup')).toContainText('ServerModCollectionSetup("2203354924")');
  await expect(page.getByTestId('mods-preview-setup')).not.toContainText('ServerModSetup("351325790")');

  await page.getByRole('button', { name: '一键加入' }).click();
  await expect(page.getByTestId('mods-selection-list')).toContainText('Show Me');
  await expect(page.getByTestId('mods-preview-setup')).toContainText('ServerModSetup("666155465")');

  await page.getByTestId('mods-prefetch-button').click();
  await expect(page.getByText('预拉取任务已提交。')).toBeVisible();
  await expect(page.getByText('[task.started] 已提交预拉取任务')).toBeVisible();
});

function createModsState(
  entries: Array<{
    workshopId: string;
    type: 'mod' | 'collection';
    source: 'search' | 'recommendation' | 'import' | 'collection';
    enabled: boolean;
    order: number;
  }> = [],
) {
  const collectionEntry = entries.find((entry) => entry.type === 'collection') ?? null;
  const collectionMembers = collectionEntry ? [searchItem] : [];
  const collectionMemberIds = new Set(collectionMembers.map((item) => item.workshopId));
  const standaloneEntries = entries.filter((entry) => entry.type === 'mod' && !collectionMemberIds.has(entry.workshopId));

  const renderedEntries = standaloneEntries.map((entry, index) => ({
    id: `entry-${entry.workshopId}`,
    projectId: 'project-e2e',
    workshopId: entry.workshopId,
    type: entry.type,
    source: entry.source,
    enabled: entry.enabled,
    order: index + (collectionEntry ? 1 : 0),
    prefetch: {
      state: 'added',
      message: '模组已加入项目，尚未预拉取。',
      updatedAt: null,
    },
    catalog: entry.workshopId === recommendationItem.workshopId ? recommendationItem : searchItem,
    collectionMembers: [],
  }));

  const previewLines = ['-- 由 DST Launcher 自动生成'];
  if (collectionEntry) {
    previewLines.push('ServerModCollectionSetup("2203354924")');
  }
  for (const entry of renderedEntries) {
    previewLines.push(`ServerModSetup("${entry.workshopId}")`);
  }

  return {
    projectId: 'project-e2e',
    summary: {
      totalSelected: entries.length,
      enabledSelected: entries.length,
      collectionId: collectionEntry?.workshopId ?? '',
      standaloneCount: renderedEntries.length,
      resolvedModIds: [...collectionMembers.map((item) => item.workshopId), ...renderedEntries.map((item) => item.workshopId)],
      prefetch: {
        state: entries.length > 0 ? 'added' : 'not_added',
        message: entries.length > 0 ? '模组已加入项目，尚未预拉取。' : '当前项目还没有配置模组。',
        updatedAt: null,
      },
    },
    collection: collectionEntry
      ? {
          id: 'entry-2203354924',
          projectId: 'project-e2e',
          workshopId: '2203354924',
          type: 'collection',
          source: 'collection',
          enabled: true,
          order: 0,
          prefetch: {
            state: 'added',
            message: '模组已加入项目，尚未预拉取。',
            updatedAt: null,
          },
          catalog: {
            workshopId: '2203354924',
            type: 'collection',
            title: 'Starter Bundle',
            author: '',
            description: '',
            previewUrl: '',
            sourceUrl: 'https://steamcommunity.com/sharedfiles/filedetails/?id=2203354924',
            tags: ['Collection'],
            updatedAt: '2025-01-03T00:00:00.000Z',
            subscriptions: 30,
            favorited: 6,
            views: 60,
            collectionMemberIds: ['351325790'],
          },
          collectionMembers,
        }
      : null,
    entries: renderedEntries,
    preview: {
      modsSetup: `${previewLines.join('\n')}\n`,
      collectionId: collectionEntry?.workshopId ?? '',
      modIds: renderedEntries.map((entry) => entry.workshopId),
    },
  };
}

function markPrefetchSuccess(state: ReturnType<typeof createModsState>) {
  const updatedAt = '2025-01-04T00:00:00.000Z';

  return {
    ...state,
    summary: {
      ...state.summary,
      prefetch: {
        state: 'success',
        message: '最近一次预拉取成功。',
        updatedAt,
      },
    },
    collection: state.collection
      ? {
          ...state.collection,
          prefetch: {
            state: 'success',
            message: '最近一次预拉取成功。',
            updatedAt,
          },
        }
      : null,
    entries: state.entries.map((entry) => ({
      ...entry,
      prefetch: {
        state: 'success',
        message: '最近一次预拉取成功。',
        updatedAt,
      },
    })),
  };
}

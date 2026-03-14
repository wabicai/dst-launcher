import type { ModCatalogItem, ModImportResult, ModRecommendationBundle, ModSearchResponse } from '@dst-launcher/shared';

const DST_APP_ID = '322330';
const SEARCH_PAGE_SIZE = 30;
const STEAM_HEADERS = {
  'content-type': 'application/x-www-form-urlencoded; charset=UTF-8',
  'user-agent': 'DST-Launcher/0.0.1',
};

const RECOMMENDATION_PRESETS: Array<{
  id: string;
  name: string;
  description: string;
  workshopIds: string[];
}> = [
  {
    id: 'basic-qol',
    name: '基础 QoL',
    description: '几乎每个服都在用的信息显示和 UI 增强，显著提升游戏体验。',
    workshopIds: [
      '666155465', // Combined Status — 状态栏 UI 增强
      '351325790', // Global Positions — 地图共享坐标
      '375859599', // Display Food Values — 食物营养/饱食度
      '376333686', // Health Info — 怪物血量显示
      '378160973', // Mini Map HUD — 右上角小地图
      '431705293', // Always On Status — 状态栏常驻不消失
    ],
  },
  {
    id: 'beginner-friendly',
    name: '新手友好',
    description: '降低上手门槛、增加容错空间，适合带新人或休闲社群服。',
    workshopIds: [
      '666155465', // Combined Status
      '375859599', // Display Food Values
      '376333686', // Health Info
      '1537129550', // Campfire Respawn — 营火处复活
      '770163721',  // No More Respawn Penalty — 取消复活惩罚
    ],
  },
  {
    id: 'building-tools',
    name: '建造辅助',
    description: '让建造、布局和探索变得更加精准高效。',
    workshopIds: [
      '367119714', // Geometric Placement — 精确网格放置
      '672695846', // Wormhole Marks — 虫洞标号/配对
      '351325790', // Global Positions
      '1467214795', // Gesture Wheel — 表情/动作快捷轮
    ],
  },
  {
    id: 'combat-hud',
    name: '战斗 HUD',
    description: '在战斗中提供更丰富的血量、状态和危险预警信息。',
    workshopIds: [
      '376333686',  // Health Info
      '1301135552', // Epic Healthbar — 精美 Boss 血条
      '666155465',  // Combined Status
      '431705293',  // Always On Status
      '378160973',  // Mini Map HUD
    ],
  },
  {
    id: 'community-regular',
    name: '社群常驻服',
    description: '长期运营社群服的成熟配置，覆盖地图、信息与协作。',
    workshopIds: [
      '351325790', // Global Positions
      '666155465', // Combined Status
      '376333686', // Health Info
      '378160973', // Mini Map HUD
      '672695846', // Wormhole Marks
      '375859599', // Display Food Values
      '431705293', // Always On Status
    ],
  },
  {
    id: 'life-quality',
    name: '生活品质',
    description: '各种细节打磨，让长期游戏更流畅，减少繁琐操作。',
    workshopIds: [
      '1467214795', // Gesture Wheel
      '431705293',  // Always On Status
      '672695846',  // Wormhole Marks
      '770163721',  // No More Respawn Penalty
      '1537129550', // Campfire Respawn
    ],
  },
  {
    id: 'resource-management',
    name: '资源管理',
    description: '容量扩展与自动化拾取，解放背包压力和操作负担。',
    workshopIds: [
      '352373173',  // More Slots — 背包格子扩展
      '1367296174', // Quick Pickup — 自动拾取物品
      '378160973',  // Mini Map HUD — 小地图
      '351325790',  // Global Positions
      '1185229323', // Simple Health Bar DST — 血量显示
    ],
  },
  {
    id: 'boss-challenge',
    name: '高难挑战',
    description: '增加 Boss 难度、强化怪物行为，适合想要挑战极限的玩家。',
    workshopIds: [
      '1301135552', // Epic Healthbar
      '376333686',  // Health Info
      '666155465',  // Combined Status
      '431705293',  // Always On Status
      '1185229323', // Simple Health Bar DST
    ],
  },
  {
    id: 'seasonal-events',
    name: '季节与探索',
    description: '增强地图探索、季节感知与 POI 标记，优化长期服务器体验。',
    workshopIds: [
      '351325790',  // Global Positions
      '672695846',  // Wormhole Marks
      '378160973',  // Mini Map HUD
      '367119714',  // Geometric Placement
      '375859599',  // Display Food Values
    ],
  },
  {
    id: 'server-admin',
    name: '服主工具',
    description: '给管理员提供命令面板、玩家信息监控与服务器运维辅助。',
    workshopIds: [
      '351325790',  // Global Positions — 全图坐标
      '666155465',  // Combined Status
      '1467214795', // Gesture Wheel — 表情轮
      '1301135552', // Epic Healthbar
      '770163721',  // No More Respawn Penalty
      '1537129550', // Campfire Respawn
    ],
  },
];

// Per-mod metadata: Chinese description and whether the mod requires server-side installation.
// serverSide=true  → must be in dedicated_server_mods_setup.lua + modoverrides.lua on the server
// serverSide=false → client-only; players subscribe on Steam Workshop themselves
const MOD_ANNOTATIONS: Record<string, { hint: string; serverSide: boolean }> = {
  '666155465': { serverSide: false, hint: '显示物品详细信息（食物属性、材料用途等），纯客户端 UI 增强。' },
  '376333686': { serverSide: false, hint: '显示饥饿值、体温、潮湿度等详细数值，纯客户端状态栏增强。' },
  '375859599': { serverSide: false, hint: '鼠标悬停即可看到怪物当前血量和最大血量，纯客户端显示。' },
  '351325790': { serverSide: false, hint: '建造时显示网格对齐辅助线，让布局更整齐，纯客户端功能。' },
  '378160973': { serverSide: true,  hint: '在地图上同步显示所有玩家位置，需要服务端运行同步逻辑。' },
  '431705293': { serverSide: false, hint: '让状态栏（饥饿、血量、理智）始终可见而不自动隐藏，纯客户端。' },
  '1537129550': { serverSide: true, hint: '允许在营火旁复活，修改服务端复活机制，需安装到服务器。' },
  '770163721':  { serverSide: true, hint: '取消鬼魂状态的理智惩罚，修改服务端游戏规则，需安装到服务器。' },
  '367119714':  { serverSide: false, hint: '手势/表情快捷轮盘，纯客户端动作触发，无需服务端。' },
  '672695846':  { serverSide: false, hint: '给虫洞自动标注配对编号，方便记忆，纯客户端 UI。' },
  '1467214795': { serverSide: false, hint: '表情/动作快捷轮盘，纯客户端，无需服务端。' },
  '352373173':  { serverSide: true,  hint: '扩展背包和箱子格子数量，需要服务端同步容量变化。' },
  '1367296174': { serverSide: true,  hint: '自动拾取地面物品，需要服务端触发拾取动作。' },
  '1185229323': { serverSide: false, hint: '显示怪物血条（简洁样式），纯客户端显示。' },
  '1301135552': { serverSide: false, hint: '为 Boss 显示精美血条，纯客户端视觉效果。' },
};

export class SteamWorkshopProvider {
  async search(query: string, page = 1): Promise<ModSearchResponse> {
    const keyword = query.trim();
    if (!keyword) {
      return {
        query: '',
        page,
        items: [],
        hasMore: false,
      };
    }

    const url = new URL('https://steamcommunity.com/workshop/browse/');
    url.searchParams.set('appid', DST_APP_ID);
    url.searchParams.set('searchtext', keyword);
    url.searchParams.set('browsesort', 'textsearch');
    url.searchParams.set('section', 'items');
    url.searchParams.set('p', String(page));

    const response = await fetch(url, {
      headers: {
        'user-agent': STEAM_HEADERS['user-agent'],
      },
    });

    if (!response.ok) {
      throw new Error(`Steam Workshop 搜索失败：${response.status}`);
    }

    const html = await response.text();
    const parsedItems = parseWorkshopSearchResults(html);
    const detailItems = await this.getPublishedFileDetails(parsedItems.map((item) => item.workshopId));
    const detailMap = new Map(detailItems.map((item) => [item.workshopId, item]));

    return {
      query: keyword,
      page,
      items: parsedItems.map((item) => mergeCatalogItem(item, detailMap.get(item.workshopId))),
      hasMore: parsedItems.length >= SEARCH_PAGE_SIZE,
    };
  }

  async import(value: string): Promise<ModImportResult> {
    const target = parseWorkshopInput(value);
    if (!target) {
      throw new Error('无法识别输入，请粘贴 Workshop 模组链接、合集链接或纯数字 ID。');
    }

    const [detail] = await this.getPublishedFileDetails([target.workshopId]);
    if (!detail) {
      throw new Error('未找到对应的 Workshop 项。');
    }

    const collectionMap = await this.getCollectionDetails([target.workshopId]);
    const memberIds = collectionMap.get(target.workshopId) ?? [];
    if (memberIds.length > 0) {
      const memberItems = await this.getPublishedFileDetails(memberIds);
      return {
        query: value.trim(),
        type: 'collection',
        items: [
          {
            ...detail,
            type: 'collection',
            collectionMemberIds: memberIds,
          },
          ...memberItems,
        ],
        message: `已解析合集 ${detail.title}，共 ${memberIds.length} 个成员。`,
      };
    }

    return {
      query: value.trim(),
      type: 'mod',
      items: [detail],
      message: `已导入模组 ${detail.title}。`,
    };
  }

  async getRecommendations(): Promise<ModRecommendationBundle[]> {
    const allIds = Array.from(new Set(RECOMMENDATION_PRESETS.flatMap((preset) => preset.workshopIds)));
    const items = await this.getPublishedFileDetails(allIds);
    const itemMap = new Map(items.map((item) => [item.workshopId, item]));

    return RECOMMENDATION_PRESETS.map((preset) => ({
      id: preset.id,
      name: preset.name,
      description: preset.description,
      items: preset.workshopIds
        .map((workshopId) => {
          const item = itemMap.get(workshopId);
          if (!item) return undefined;
          const annotation = MOD_ANNOTATIONS[workshopId];
          return annotation
            ? { ...item, serverSide: annotation.serverSide, description: annotation.hint }
            : item;
        })
        .filter((item): item is ModCatalogItem => Boolean(item)),
    }));
  }

  async getPublishedFileDetails(workshopIds: string[]): Promise<ModCatalogItem[]> {
    const normalizedIds = Array.from(new Set(workshopIds.filter((item) => /^\d+$/.test(item))));
    if (normalizedIds.length === 0) {
      return [];
    }

    const body = new URLSearchParams();
    body.set('itemcount', String(normalizedIds.length));
    normalizedIds.forEach((workshopId, index) => {
      body.set(`publishedfileids[${index}]`, workshopId);
    });

    const response = await fetch('https://api.steampowered.com/ISteamRemoteStorage/GetPublishedFileDetails/v1/', {
      method: 'POST',
      headers: STEAM_HEADERS,
      body,
    });

    if (!response.ok) {
      throw new Error(`Steam Workshop 详情获取失败：${response.status}`);
    }

    const payload = (await response.json()) as PublishedFileDetailsPayload;
    const collectionMap = await this.getCollectionDetails(normalizedIds);

    return (payload.response?.publishedfiledetails ?? [])
      .map((detail) => mapPublishedFileDetail(detail, collectionMap))
      .filter((item): item is ModCatalogItem => Boolean(item));
  }

  async getCollectionDetails(workshopIds: string[]): Promise<Map<string, string[]>> {
    const normalizedIds = Array.from(new Set(workshopIds.filter((item) => /^\d+$/.test(item))));
    if (normalizedIds.length === 0) {
      return new Map();
    }

    const body = new URLSearchParams();
    body.set('collectioncount', String(normalizedIds.length));
    normalizedIds.forEach((workshopId, index) => {
      body.set(`publishedfileids[${index}]`, workshopId);
    });

    const response = await fetch('https://api.steampowered.com/ISteamRemoteStorage/GetCollectionDetails/v1/', {
      method: 'POST',
      headers: STEAM_HEADERS,
      body,
    });

    if (!response.ok) {
      throw new Error(`Steam Workshop 合集解析失败：${response.status}`);
    }

    const payload = (await response.json()) as CollectionDetailsPayload;
    return mapCollectionDetails(payload);
  }
}

export function parseWorkshopInput(value: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  if (/^\d+$/.test(trimmed)) {
    return {
      workshopId: trimmed,
      type: 'unknown' as const,
    };
  }

  try {
    const url = new URL(trimmed);
    const workshopId = url.searchParams.get('id');
    if (!workshopId || !/^\d+$/.test(workshopId)) {
      return null;
    }

    const pathname = url.pathname.toLowerCase();
    return {
      workshopId,
      type: pathname.includes('/filedetails') ? ('unknown' as const) : ('unknown' as const),
    };
  } catch {
    return null;
  }
}

export function parseWorkshopSearchResults(html: string): ModCatalogItem[] {
  const items: ModCatalogItem[] = [];
  const seen = new Set<string>();
  const idRegex = /data-publishedfileid="(\d+)"/g;

  for (const match of html.matchAll(idRegex)) {
    const workshopId = String(match[1] ?? '').trim();
    if (!/^\d+$/.test(workshopId)) {
      continue;
    }
    if (seen.has(workshopId)) {
      continue;
    }

    seen.add(workshopId);
    const start = match.index ?? 0;
    const slice = html.slice(start, start + 5000);
    const sourceUrl = extractFirst(slice, /href="([^"]*filedetails\/\?id=\d+[^"]*)"/i) ?? `https://steamcommunity.com/sharedfiles/filedetails/?id=${workshopId}`;
    const previewUrl = extractFirst(slice, /class="workshopItemPreviewImage"[^>]*src="([^"]+)"/i) ?? '';
    const title = decodeHtml(stripTags(extractFirst(slice, /class="workshopItemTitle(?:\s+ellipsis)?">([\s\S]*?)<\/div>/i) ?? `Workshop ${workshopId}`));
    const author = decodeHtml(stripTags(extractFirst(slice, /class="workshopItemAuthorName(?:\s+ellipsis)?">([\s\S]*?)<\/div>/i) ?? ''));

    items.push({
      workshopId,
      type: 'mod',
      title,
      author,
      description: '',
      previewUrl,
      sourceUrl: absolutizeSteamUrl(sourceUrl),
      tags: [],
      updatedAt: null,
      subscriptions: 0,
      favorited: 0,
      views: 0,
      collectionMemberIds: [],
      serverSide: false,
    });

    if (items.length >= SEARCH_PAGE_SIZE) {
      break;
    }
  }

  return items;
}

export function mapCollectionDetails(payload: CollectionDetailsPayload) {
  const map = new Map<string, string[]>();
  const details = payload.response?.collectiondetails ?? [];

  for (const detail of details) {
    const members = (detail.children ?? [])
      .map((item) => String(item.publishedfileid ?? '').trim())
      .filter((item) => /^\d+$/.test(item));
    map.set(String(detail.publishedfileid), Array.from(new Set(members)));
  }

  return map;
}

export function mapPublishedFileDetail(
  detail: PublishedFileDetail | undefined,
  collectionMap: Map<string, string[]>,
): ModCatalogItem | null {
  if (!detail || Number(detail.result) !== 1) {
    return null;
  }

  const workshopId = String(detail.publishedfileid ?? '').trim();
  if (!/^\d+$/.test(workshopId)) {
    return null;
  }

  const collectionMemberIds = collectionMap.get(workshopId) ?? [];
  const tags = Array.isArray(detail.tags)
    ? detail.tags
        .map((tag) => String(tag.tag ?? '').trim())
        .filter(Boolean)
    : [];

  return {
    workshopId,
    type: collectionMemberIds.length > 0 ? 'collection' : 'mod',
    title: decodeHtml(String(detail.title ?? `Workshop ${workshopId}`)),
    author: '',
    description: decodeHtml(String(detail.description ?? '')),
    previewUrl: String(detail.preview_url ?? ''),
    sourceUrl: `https://steamcommunity.com/sharedfiles/filedetails/?id=${workshopId}`,
    tags,
    updatedAt: toIsoString(detail.time_updated),
    subscriptions: toSafeInteger(detail.subscriptions),
    favorited: toSafeInteger(detail.favorited),
    views: toSafeInteger(detail.views),
    collectionMemberIds,
    serverSide: false,
  };
}

function mergeCatalogItem(base: ModCatalogItem, detail?: ModCatalogItem) {
  if (!detail) {
    return base;
  }

  return {
    ...base,
    ...detail,
    previewUrl: detail.previewUrl || base.previewUrl,
    sourceUrl: detail.sourceUrl || base.sourceUrl,
    author: detail.author || base.author,
  };
}

function extractFirst(source: string, pattern: RegExp) {
  const match = source.match(pattern);
  return match?.[1]?.trim() ?? null;
}

function stripTags(value: string) {
  return value.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

function decodeHtml(value: string) {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .trim();
}

function absolutizeSteamUrl(value: string) {
  if (value.startsWith('http://') || value.startsWith('https://')) {
    return value;
  }
  if (value.startsWith('//')) {
    return `https:${value}`;
  }
  if (value.startsWith('/')) {
    return `https://steamcommunity.com${value}`;
  }
  return value;
}

function toSafeInteger(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.trunc(parsed)) : 0;
}

function toIsoString(value: unknown) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }
  return new Date(parsed * 1000).toISOString();
}

interface PublishedFileDetailsPayload {
  response?: {
    publishedfiledetails?: PublishedFileDetail[];
  };
}

interface PublishedFileDetail {
  result?: number;
  publishedfileid?: string | number;
  title?: string;
  description?: string;
  preview_url?: string;
  creator?: string;
  creator_appid?: string | number;
  time_updated?: number;
  subscriptions?: number;
  favorited?: number;
  views?: number;
  tags?: Array<{ tag?: string }>;
}

interface CollectionDetailsPayload {
  response?: {
    collectiondetails?: Array<{
      publishedfileid: string | number;
      children?: Array<{ publishedfileid?: string | number }>;
    }>;
  };
}

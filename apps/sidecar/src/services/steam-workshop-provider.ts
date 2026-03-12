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
    id: 'light-qol',
    name: '轻量 QoL',
    description: '开服后最常用的一组轻量便利模组。',
    workshopIds: ['351325790', '666155465', '376333686'],
  },
  {
    id: 'starter-friendly',
    name: '新手友好',
    description: '适合社群入门服，信息展示更完整。',
    workshopIds: ['351325790', '666155465', '375859599'],
  },
  {
    id: 'community-regular',
    name: '社群常驻服',
    description: '围绕长期常驻服常见的观感与协作增强。',
    workshopIds: ['351325790', '666155465', '376333686', '378160973'],
  },
];

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
      items: preset.workshopIds.map((workshopId) => itemMap.get(workshopId)).filter((item): item is ModCatalogItem => Boolean(item)),
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

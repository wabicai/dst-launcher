import { describe, expect, it } from 'vitest';
import {
  mapCollectionDetails,
  mapPublishedFileDetail,
  parseWorkshopInput,
  parseWorkshopSearchResults,
} from '../services/steam-workshop-provider';

describe('SteamWorkshopProvider 解析工具', () => {
  it('可以识别 Workshop 链接和纯数字 ID', () => {
    expect(parseWorkshopInput('351325790')).toEqual({
      workshopId: '351325790',
      type: 'unknown',
    });

    expect(parseWorkshopInput('https://steamcommunity.com/sharedfiles/filedetails/?id=2203354924')).toEqual({
      workshopId: '2203354924',
      type: 'unknown',
    });
  });

  it('可以解析搜索结果 HTML', () => {
    const html = `
      <div class="workshopItem">
        <a class="ugc" data-publishedfileid="351325790" href="/sharedfiles/filedetails/?id=351325790">
          <img class="workshopItemPreviewImage" src="https://cdn.example.com/preview.jpg" />
          <div class="workshopItemTitle ellipsis">Geometric Placement</div>
          <div class="workshopItemAuthorName ellipsis">Rezecib</div>
        </a>
      </div>
    `;

    const items = parseWorkshopSearchResults(html);
    expect(items).toHaveLength(1);
    expect(items[0]?.workshopId).toBe('351325790');
    expect(items[0]?.title).toBe('Geometric Placement');
    expect(items[0]?.previewUrl).toContain('preview.jpg');
  });

  it('可以映射 PublishedFileDetails 与合集成员', () => {
    const collectionMap = new Map([['2203354924', ['351325790', '666155465']]]);
    const collection = mapPublishedFileDetail(
      {
        result: 1,
        publishedfileid: '2203354924',
        title: 'Starter Bundle',
        description: 'collection',
        preview_url: 'https://cdn.example.com/bundle.jpg',
        time_updated: 1700000000,
        subscriptions: 10,
        favorited: 4,
        views: 99,
        tags: [{ tag: 'Server' }],
      },
      collectionMap,
    );

    expect(collection?.type).toBe('collection');
    expect(collection?.collectionMemberIds).toEqual(['351325790', '666155465']);
  });

  it('可以解析 CollectionDetails 响应', () => {
    const collectionMap = mapCollectionDetails({
      response: {
        collectiondetails: [
          {
            publishedfileid: '2203354924',
            children: [
              { publishedfileid: '351325790' },
              { publishedfileid: '666155465' },
              { publishedfileid: '351325790' },
            ],
          },
        ],
      },
    });

    expect(collectionMap.get('2203354924')).toEqual(['351325790', '666155465']);
  });
});

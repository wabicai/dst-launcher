'use client';

import { useEffect, useMemo, useState } from 'react';
import useSWR from 'swr';
import {
  ArrowDown,
  ArrowUp,
  Boxes,
  Download,
  ExternalLink,
  LoaderCircle,
  PackagePlus,
  Search,
  Sparkles,
  Unplug,
} from 'lucide-react';
import type {
  ModCatalogItem,
  ModEntrySource,
  ModImportResult,
  ModRecommendationBundle,
  ProjectModEntry,
  ProjectModEntryInput,
  ProjectModsDetail,
  TaskEvent,
  LogEvent,
} from '@dst-launcher/shared';
import { getApiClient, toWsUrl } from '@/lib/api';
import { formatDateTime } from '@/lib/format';
import { CopyButton } from './copy-button';
import { Button } from './ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Input } from './ui/input';

type SelectionFilter = 'all' | 'added' | 'success' | 'failed';
type StreamLine = {
  id: string;
  source: 'stdout' | 'stderr' | 'task';
  message: string;
  timestamp: string;
};

export function ProjectModsWorkbench({
  projectId,
  onProjectChanged,
}: {
  projectId: string;
  onProjectChanged?: () => Promise<unknown> | unknown;
}) {
  const client = useMemo(() => getApiClient(), []);
  const { data, error, isLoading, mutate } = useSWR(['project-mods', projectId], () => client.getProjectMods(projectId), {
    refreshInterval: 5000,
  });
  const { data: recommendations } = useSWR(['mod-recommendations'], () => client.getModRecommendations());
  const [query, setQuery] = useState('');
  const [searchBusy, setSearchBusy] = useState(false);
  const [saveBusy, setSaveBusy] = useState(false);
  const [prefetchBusy, setPrefetchBusy] = useState(false);
  const [filter, setFilter] = useState<SelectionFilter>('all');
  const [searchPage, setSearchPage] = useState(1);
  const [searchResults, setSearchResults] = useState<ModCatalogItem[]>([]);
  const [importResult, setImportResult] = useState<ModImportResult | null>(null);
  const [message, setMessage] = useState('');
  const [prefetchStatus, setPrefetchStatus] = useState('尚未开始预拉取。');
  const [streamLines, setStreamLines] = useState<StreamLine[]>([]);

  useEffect(() => {
    const logsSocket = new WebSocket(toWsUrl(`/ws/logs?projectId=${projectId}`));
    const tasksSocket = new WebSocket(toWsUrl(`/ws/tasks?projectId=${projectId}`));

    logsSocket.onmessage = (event) => {
      const payload = JSON.parse(event.data) as LogEvent;
      if (payload.stream === 'system') {
        return;
      }
      setStreamLines((current) => [
        ...current.slice(-119),
        {
          id: `${payload.timestamp}-${Math.random()}`,
          source: payload.stream === 'stderr' ? 'stderr' : 'stdout',
          message: payload.line,
          timestamp: payload.timestamp,
        },
      ]);
    };

    tasksSocket.onmessage = (event) => {
      const payload = JSON.parse(event.data) as TaskEvent;
      if (!('action' in payload) || payload.action !== 'prefetch-mods') {
        return;
      }

      const statusText =
        payload.type === 'task.failed'
          ? `预拉取失败：${payload.message}`
          : payload.type === 'task.finished'
            ? payload.message || '模组预拉取完成。'
            : payload.message;
      setPrefetchStatus(statusText);
      setStreamLines((current) => [
        ...current.slice(-119),
        {
          id: `${payload.timestamp}-${Math.random()}`,
          source: 'task',
          message: `[${payload.type}] ${payload.message}`.trim(),
          timestamp: payload.timestamp,
        },
      ]);
    };

    return () => {
      logsSocket.close();
      tasksSocket.close();
    };
  }, [projectId]);

  const visibleEntries = useMemo(() => {
    if (!data) {
      return [];
    }

    if (filter === 'all') {
      return data.entries;
    }

    return data.entries.filter((entry) => entry.prefetch.state === filter);
  }, [data, filter]);

  async function refreshAll(next?: ProjectModsDetail) {
    await mutate(next, { revalidate: !next });
    await onProjectChanged?.();
  }

  async function persistEntries(entries: ProjectModEntryInput[]) {
    setSaveBusy(true);
    setMessage('');
    try {
      const next = await client.updateProjectMods(projectId, { entries });
      await refreshAll(next);
      setMessage('项目模组清单已更新。');
    } catch (updateError) {
      setMessage(updateError instanceof Error ? `保存模组失败：${updateError.message}` : '保存模组失败。');
    } finally {
      setSaveBusy(false);
    }
  }

  async function handleSearch(submitPage = 1) {
    const trimmed = query.trim();
    if (!trimmed) {
      setSearchResults([]);
      setImportResult(null);
      return;
    }

    setSearchBusy(true);
    setMessage('');
    try {
      if (looksLikeWorkshopInput(trimmed)) {
        const result = await client.importMods({ value: trimmed });
        setImportResult(result);
        setSearchResults([]);
        setSearchPage(1);
        setMessage(result.message || '导入成功。');
        return;
      }

      const response = await client.searchMods(trimmed, submitPage);
      setImportResult(null);
      setSearchPage(submitPage);
      setSearchResults((current) => (submitPage === 1 ? response.items : dedupeCatalogItems([...current, ...response.items])));
      setMessage(response.items.length > 0 ? `已加载第 ${submitPage} 页搜索结果。` : '没有找到匹配的模组。');
    } catch (searchError) {
      setMessage(searchError instanceof Error ? `模组搜索失败：${searchError.message}` : '模组搜索失败。');
    } finally {
      setSearchBusy(false);
    }
  }

  async function addCatalogItem(item: ModCatalogItem, source: ModEntrySource) {
    if (!data) {
      return;
    }

    const currentEntries = serializeEntries(data);
    const withoutExistingCollection = item.type === 'collection'
      ? currentEntries.filter((entry) => entry.type !== 'collection')
      : currentEntries;
    const nextEntries = dedupeEntryInputs([
      ...withoutExistingCollection,
      {
        workshopId: item.workshopId,
        type: item.type,
        source,
        enabled: true,
        order: withoutExistingCollection.length,
      },
    ]);
    await persistEntries(nextEntries);
  }

  async function removeEntry(entry: ProjectModEntry) {
    if (!data) {
      return;
    }

    const nextEntries = serializeEntries(data).filter((item) => item.workshopId !== entry.workshopId);
    await persistEntries(nextEntries);
  }

  async function moveEntry(entry: ProjectModEntry, direction: -1 | 1) {
    if (!data) {
      return;
    }

    const entries = [...serializeEntries(data)];
    const index = entries.findIndex((item) => item.workshopId === entry.workshopId);
    const targetIndex = index + direction;
    if (index < 0 || targetIndex < 0 || targetIndex >= entries.length) {
      return;
    }

    const nextEntries = [...entries];
    const [current] = nextEntries.splice(index, 1);
    if (!current) {
      return;
    }
    nextEntries.splice(targetIndex, 0, current);
    await persistEntries(nextEntries.map((item, order) => ({ ...item, order })));
  }

  async function addRecommendationBundle(bundle: ModRecommendationBundle) {
    if (!data) {
      return;
    }

    const nextEntries = dedupeEntryInputs([
      ...serializeEntries(data),
      ...bundle.items.map((item, index) => ({
        workshopId: item.workshopId,
        type: item.type,
        source: 'recommendation' as const,
        enabled: true,
        order: data.entries.length + index + (data.collection ? 1 : 0),
      })),
    ]);
    await persistEntries(nextEntries);
  }

  async function handlePrefetch() {
    setPrefetchBusy(true);
    setMessage('');
    try {
      await client.runAction(projectId, 'prefetch-mods');
      setPrefetchStatus('已提交预拉取任务，等待日志输出。');
      setStreamLines((current) => [
        ...current.slice(-119),
        {
          id: `local-${Date.now()}`,
          source: 'task',
          message: '[task.started] 已提交预拉取任务',
          timestamp: new Date().toISOString(),
        },
      ]);
      setMessage('预拉取任务已提交。');
      await refreshAll();
    } catch (prefetchError) {
      setMessage(prefetchError instanceof Error ? `预拉取失败：${prefetchError.message}` : '预拉取失败。');
    } finally {
      setPrefetchBusy(false);
    }
  }

  if (isLoading) {
    return <div className="rounded-2xl border border-border bg-panel/88 p-8 text-sm text-muted-foreground">模组数据加载中...</div>;
  }

  if (error || !data) {
    return <div className="rounded-2xl border border-danger/30 bg-danger/10 p-8 text-sm text-danger">{error instanceof Error ? error.message : '模组数据不可用'}</div>;
  }

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1.1fr)_420px]">
      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>模组工作台</CardTitle>
            <CardDescription>搜索、导入、加入项目与预拉取，全部收敛在这里。</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_140px_124px_124px]">
              <div className="space-y-2">
                <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">搜索 / 导入</div>
                <Input
                  data-testid="mods-toolbar-input"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="关键词、Workshop 链接、合集链接或纯数字 ID"
                />
              </div>
              <div className="space-y-2">
                <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">筛选</div>
                <select
                  value={filter}
                  onChange={(event) => setFilter(event.target.value as SelectionFilter)}
                  className="h-10 w-full rounded-xl border border-border bg-inset px-3 text-sm text-foreground outline-none transition-all focus:border-[hsl(var(--primary)/0.48)] focus:bg-panel"
                >
                  <option value="all">全部已选</option>
                  <option value="added">待预拉取</option>
                  <option value="success">最近成功</option>
                  <option value="failed">最近失败</option>
                </select>
              </div>
              <div className="space-y-2">
                <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">已选</div>
                <div className="flex h-10 items-center rounded-xl border border-border bg-inset px-3 text-sm text-foreground">
                  {data.summary.totalSelected} 项
                </div>
              </div>
              <div className="space-y-2">
                <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">动作</div>
                <div className="flex gap-2">
                  <Button type="button" variant="secondary" className="flex-1" disabled={searchBusy} onClick={() => void handleSearch(1)}>
                    {searchBusy ? <LoaderCircle className="size-4 animate-spin" /> : <Search className="size-4" />}
                    {looksLikeWorkshopInput(query) ? '导入' : '搜索'}
                  </Button>
                  <Button
                    data-testid="mods-prefetch-button"
                    type="button"
                    className="flex-1"
                    disabled={prefetchBusy || data.summary.totalSelected === 0 || saveBusy}
                    onClick={() => void handlePrefetch()}
                  >
                    {prefetchBusy ? <LoaderCircle className="size-4 animate-spin" /> : <Download className="size-4" />}
                    预拉取
                  </Button>
                </div>
              </div>
            </div>

            {message ? <div className="rounded-2xl border border-border bg-inset/60 px-4 py-3 text-sm text-muted-foreground">{message}</div> : null}
          </CardContent>
        </Card>

        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <Card>
            <CardHeader>
              <CardTitle>搜索 / 导入结果</CardTitle>
              <CardDescription>关键词搜索和粘贴导入共用同一个入口。</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {importResult ? (
                <div className="space-y-3">
                  <div className="rounded-2xl border border-border bg-inset/60 px-4 py-3 text-sm text-muted-foreground">{importResult.message}</div>
                  {importResult.items.map((item, index) => (
                    <CatalogRow
                      key={`${item.workshopId}-${index}`}
                      item={item}
                      actionLabel={index === 0 ? '加入项目' : '合集成员'}
                      disabled={index !== 0 || saveBusy}
                      onAction={index === 0 ? () => void addCatalogItem(item, importResult.type === 'collection' ? 'collection' : 'import') : undefined}
                    />
                  ))}
                </div>
              ) : searchResults.length > 0 ? (
                <div className="space-y-3">
                  {searchResults.map((item) => (
                    <CatalogRow key={item.workshopId} item={item} actionLabel="加入项目" disabled={saveBusy} onAction={() => void addCatalogItem(item, 'search')} />
                  ))}
                  <Button type="button" variant="secondary" disabled={searchBusy} onClick={() => void handleSearch(searchPage + 1)}>
                    {searchBusy ? <LoaderCircle className="size-4 animate-spin" /> : <Search className="size-4" />}
                    加载更多
                  </Button>
                </div>
              ) : (
                <EmptyState
                  title="还没有搜索结果"
                  description="输入关键词可搜索 DST 模组，输入链接或纯数字 ID 会自动走导入。"
                  icon={Search}
                />
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>推荐模组包</CardTitle>
              <CardDescription>首版先提供开服常用预设，不做热榜页。</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {recommendations && recommendations.length > 0 ? (
                recommendations.map((bundle) => (
                  <div key={bundle.id} className="rounded-2xl border border-border bg-inset/50 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-sm font-medium text-foreground">{bundle.name}</div>
                        <div className="mt-1 text-sm text-muted-foreground">{bundle.description}</div>
                      </div>
                      <Button type="button" variant="secondary" size="sm" disabled={saveBusy || bundle.items.length === 0} onClick={() => void addRecommendationBundle(bundle)}>
                        <PackagePlus className="size-3.5" />
                        一键加入
                      </Button>
                    </div>
                    <div className="mt-3 space-y-2">
                      {bundle.items.map((item) => (
                        <div key={item.workshopId} className="flex items-center justify-between gap-3 rounded-xl border border-border/80 bg-panel/70 px-3 py-2 text-sm">
                          <div className="truncate text-foreground">{item.title}</div>
                          <span className="font-mono text-[11px] text-muted-foreground">{item.workshopId}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))
              ) : (
                <EmptyState title="推荐列表为空" description="当前没能加载到预设模组包。" icon={Sparkles} />
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>当前项目模组</CardTitle>
            <CardDescription>合集单独展示，单独模组支持排序、移除和复制。</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {data.collection ? (
              <div data-testid="mods-collection-block" className="rounded-2xl border border-border bg-inset/50 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">合集</div>
                    <div className="mt-1 text-sm font-medium text-foreground">{data.collection.catalog.title}</div>
                    <div className="mt-1 text-sm text-muted-foreground">{data.collection.collectionMembers.length} 个成员</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <CopyButton value={data.collection.catalog.sourceUrl} label="复制链接" />
                    <Button type="button" variant="ghost" size="sm" disabled={saveBusy} onClick={() => void removeEntry(data.collection!)}>
                      <Unplug className="size-3.5" />
                      移除
                    </Button>
                  </div>
                </div>
                <div className="mt-3 space-y-2">
                  {data.collection.collectionMembers.map((item) => (
                    <div key={item.workshopId} className="flex items-center justify-between gap-3 rounded-xl border border-border/80 bg-panel/70 px-3 py-2 text-sm">
                      <div className="truncate text-foreground">{item.title}</div>
                      <span className="font-mono text-[11px] text-muted-foreground">{item.workshopId}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            <div data-testid="mods-selection-list" className="space-y-3">
              {visibleEntries.length > 0 ? (
                visibleEntries.map((entry, index) => (
                  <div key={entry.id} className="rounded-2xl border border-border bg-panel/88 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <div className="truncate text-sm font-medium text-foreground">{entry.catalog.title}</div>
                          <SourcePill source={entry.source} />
                          <PrefetchPill state={entry.prefetch.state} />
                        </div>
                        <div className="mt-1 text-sm text-muted-foreground">{entry.catalog.author || '作者信息缺失'}</div>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {entry.catalog.tags.slice(0, 3).map((tag) => (
                            <span key={tag} className="rounded-full border border-border bg-inset px-2 py-1 text-[11px] text-muted-foreground">
                              {tag}
                            </span>
                          ))}
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        <Button type="button" variant="ghost" size="sm" disabled={saveBusy || index === 0} onClick={() => void moveEntry(entry, -1)}>
                          <ArrowUp className="size-3.5" />
                        </Button>
                        <Button type="button" variant="ghost" size="sm" disabled={saveBusy || index === visibleEntries.length - 1} onClick={() => void moveEntry(entry, 1)}>
                          <ArrowDown className="size-3.5" />
                        </Button>
                        <CopyButton value={entry.catalog.sourceUrl} label="复制链接" />
                        <Button type="button" variant="ghost" size="sm" disabled={saveBusy} onClick={() => void removeEntry(entry)}>
                          <Unplug className="size-3.5" />
                          移除
                        </Button>
                      </div>
                    </div>
                    <div className="mt-3 flex items-center justify-between gap-3 text-xs text-muted-foreground">
                      <span>{entry.catalog.workshopId}</span>
                      <span>{formatDateTime(entry.prefetch.updatedAt || entry.catalog.updatedAt)}</span>
                    </div>
                  </div>
                ))
              ) : (
                <EmptyState title="项目里还没有单独安装的模组" description="可以从左侧搜索结果、导入结果或推荐包直接加入。" icon={Boxes} />
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>预拉取与预览</CardTitle>
            <CardDescription>{prefetchStatus}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="rounded-2xl border border-border bg-inset/60 px-4 py-3">
              <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">摘要</div>
              <div className="mt-2 text-sm text-foreground">
                已选 {data.summary.totalSelected} 项，解析后共 {data.summary.resolvedModIds.length} 个 Workshop 模组。
              </div>
            </div>

            <div className="rounded-2xl border border-border bg-console">
              <div className="flex items-center justify-between gap-3 border-b border-white/5 px-4 py-3">
                <div className="font-mono text-[12px] text-slate-200">dedicated_server_mods_setup.lua</div>
                <CopyButton value={data.preview.modsSetup} label="复制" />
              </div>
              <pre data-testid="mods-preview-setup" className="max-h-64 overflow-auto px-4 py-4 font-mono text-[12px] leading-6 text-slate-200">
                {data.preview.modsSetup}
              </pre>
            </div>

            <div className="rounded-2xl border border-border bg-console">
              <div className="flex items-center justify-between gap-3 border-b border-white/5 px-4 py-3">
                <div className="font-mono text-[12px] text-slate-200">prefetch logs</div>
                <span className="font-mono text-[11px] text-slate-500">{streamLines.length} lines</span>
              </div>
              <div className="max-h-64 overflow-auto px-4 py-3 font-mono text-[12px] leading-6 text-slate-200">
                {streamLines.length === 0 ? (
                  <div className="rounded-xl border border-white/5 bg-white/[0.02] px-4 py-4 text-slate-500">还没有预拉取日志。</div>
                ) : (
                  streamLines.map((line) => (
                    <div key={line.id} className="grid grid-cols-[84px_64px_minmax(0,1fr)] gap-3 border-b border-white/5 py-1.5 last:border-b-0">
                      <span className="text-slate-500">{new Date(line.timestamp).toLocaleTimeString()}</span>
                      <span className={line.source === 'stderr' ? 'text-rose-400' : line.source === 'stdout' ? 'text-emerald-400' : 'text-sky-400'}>
                        [{line.source}]
                      </span>
                      <span className="whitespace-pre-wrap break-words">{line.message}</span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function CatalogRow({
  item,
  actionLabel,
  disabled,
  onAction,
}: {
  item: ModCatalogItem;
  actionLabel: string;
  disabled: boolean;
  onAction?: () => void;
}) {
  return (
    <div data-testid={`mod-search-result-${item.workshopId}`} className="rounded-2xl border border-border bg-panel/88 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <div className="truncate text-sm font-medium text-foreground">{item.title}</div>
            {item.type === 'collection' ? <SourcePill source="collection" /> : null}
          </div>
          <div className="mt-1 text-sm text-muted-foreground">{item.author || '作者信息缺失'}</div>
          <div className="mt-3 flex flex-wrap gap-2">
            {item.tags.slice(0, 4).map((tag) => (
              <span key={tag} className="rounded-full border border-border bg-inset px-2 py-1 text-[11px] text-muted-foreground">
                {tag}
              </span>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <a
            href={item.sourceUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex h-8 items-center justify-center rounded-lg border border-border bg-inset px-3 text-xs text-muted-foreground transition hover:border-[hsl(var(--primary)/0.18)] hover:text-foreground"
          >
            <ExternalLink className="mr-1 size-3.5" />
            Steam
          </a>
          {onAction ? (
            <Button type="button" size="sm" variant="secondary" disabled={disabled} onClick={onAction}>
              <PackagePlus className="size-3.5" />
              {actionLabel}
            </Button>
          ) : null}
        </div>
      </div>
      <div className="mt-3 flex items-center justify-between gap-3 text-xs text-muted-foreground">
        <span>{item.workshopId}</span>
        <span>{formatDateTime(item.updatedAt)}</span>
      </div>
    </div>
  );
}

function SourcePill({ source }: { source: ModEntrySource }) {
  const labelMap: Record<ModEntrySource, string> = {
    search: '搜索',
    recommendation: '推荐',
    import: '导入',
    collection: '合集',
  };

  return (
    <span className="rounded-full border border-border bg-inset px-2 py-1 text-[11px] text-muted-foreground">
      {labelMap[source]}
    </span>
  );
}

function PrefetchPill({ state }: { state: ProjectModEntry['prefetch']['state'] }) {
  const labelMap = {
    not_added: '未加入',
    added: '待预拉取',
    success: '最近成功',
    failed: '最近失败',
  } as const;
  const toneMap = {
    not_added: 'border-border bg-inset text-muted-foreground',
    added: 'border-warning/25 bg-warning/10 text-warning',
    success: 'border-success/25 bg-success/10 text-success',
    failed: 'border-danger/25 bg-danger/10 text-danger',
  } as const;

  return <span className={`rounded-full border px-2 py-1 text-[11px] ${toneMap[state]}`}>{labelMap[state]}</span>;
}

function EmptyState({
  title,
  description,
  icon: Icon,
}: {
  title: string;
  description: string;
  icon: typeof Search;
}) {
  return (
    <div className="rounded-2xl border border-border bg-inset/60 px-4 py-5 text-sm text-muted-foreground">
      <div className="flex items-center gap-2 text-foreground">
        <Icon className="size-4" />
        <span className="font-medium">{title}</span>
      </div>
      <div className="mt-2 leading-6">{description}</div>
    </div>
  );
}

function serializeEntries(detail: ProjectModsDetail): ProjectModEntryInput[] {
  const entries: ProjectModEntryInput[] = [];
  if (detail.collection) {
    entries.push({
      workshopId: detail.collection.workshopId,
      type: detail.collection.type,
      source: detail.collection.source,
      enabled: detail.collection.enabled,
      order: 0,
    });
  }

  entries.push(
    ...detail.entries.map((entry, index) => ({
      workshopId: entry.workshopId,
      type: entry.type,
      source: entry.source,
      enabled: entry.enabled,
      order: index + entries.length,
    })),
  );

  return entries;
}

function looksLikeWorkshopInput(value: string) {
  const trimmed = value.trim();
  return /^\d+$/.test(trimmed) || /steamcommunity\.com\/.+id=\d+/i.test(trimmed);
}

function dedupeCatalogItems(items: ModCatalogItem[]) {
  const map = new Map<string, ModCatalogItem>();
  for (const item of items) {
    if (!map.has(item.workshopId)) {
      map.set(item.workshopId, item);
    }
  }
  return Array.from(map.values());
}

function dedupeEntryInputs(entries: ProjectModEntryInput[]) {
  const map = new Map<string, ProjectModEntryInput>();
  let collectionEntry: ProjectModEntryInput | null = null;

  for (const entry of entries) {
    if (!entry.enabled) {
      continue;
    }

    if (entry.type === 'collection') {
      if (!collectionEntry) {
        collectionEntry = entry;
      }
      continue;
    }

    if (!map.has(entry.workshopId)) {
      map.set(entry.workshopId, entry);
    }
  }

  return [
    ...(collectionEntry ? [{ ...collectionEntry, order: 0 }] : []),
    ...Array.from(map.values()).map((entry, index) => ({
      ...entry,
      order: index + (collectionEntry ? 1 : 0),
    })),
  ];
}

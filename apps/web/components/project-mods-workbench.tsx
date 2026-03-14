'use client';

import { useEffect, useMemo, useState } from 'react';
import useSWR from 'swr';
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Boxes,
  Check,
  Download,
  ExternalLink,
  HelpCircle,
  LoaderCircle,
  PackagePlus,
  Search,
  Sparkles,
  Trash2,
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
import { Switch } from './ui/switch';

type SelectionFilter = 'all' | 'added' | 'success' | 'failed' | 'disabled';
type LeftPanel = 'search' | 'recommend';
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
  const [leftPanel, setLeftPanel] = useState<LeftPanel>('search');
  const [searchPage, setSearchPage] = useState(1);
  const [searchResults, setSearchResults] = useState<ModCatalogItem[]>([]);
  const [importResult, setImportResult] = useState<ModImportResult | null>(null);
  const [message, setMessage] = useState('');
  const [prefetchStatus, setPrefetchStatus] = useState('尚未开始预拉取。');
  const [streamLines, setStreamLines] = useState<StreamLine[]>([]);
  const [showPrefetchLog, setShowPrefetchLog] = useState(false);

  useEffect(() => {
    const logsSocket = new WebSocket(toWsUrl(`/ws/logs?projectId=${projectId}`));
    const tasksSocket = new WebSocket(toWsUrl(`/ws/tasks?projectId=${projectId}`));

    logsSocket.onmessage = (event) => {
      const payload = JSON.parse(event.data) as LogEvent;
      if (payload.stream === 'system') return;
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
      if (!('action' in payload) || payload.action !== 'prefetch-mods') return;
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

  // Set of already-added workshop IDs for disabled state
  const addedIds = useMemo(() => {
    const ids = new Set<string>();
    if (data?.collection) ids.add(data.collection.workshopId);
    for (const entry of data?.entries ?? []) ids.add(entry.workshopId);
    return ids;
  }, [data]);

  const visibleEntries = useMemo(() => {
    if (!data) return [];
    if (filter === 'all') return data.entries;
    if (filter === 'disabled') return data.entries.filter((entry) => !entry.enabled);
    // prefetch state filters only apply to enabled entries
    return data.entries.filter((entry) => entry.enabled && entry.prefetch.state === filter);
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
    setLeftPanel('search');
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
    if (!data) return;
    const currentEntries = serializeEntries(data);
    const withoutExistingCollection = item.type === 'collection'
      ? currentEntries.filter((entry) => entry.type !== 'collection')
      : currentEntries;
    const nextEntries = dedupeEntryInputs([
      ...withoutExistingCollection,
      { workshopId: item.workshopId, type: item.type, source, enabled: true, order: withoutExistingCollection.length },
    ]);
    await persistEntries(nextEntries);
  }

  async function removeEntry(entry: ProjectModEntry) {
    if (!data) return;
    const nextEntries = serializeEntries(data).filter((item) => item.workshopId !== entry.workshopId);
    await persistEntries(nextEntries);
  }

  async function toggleEntry(entry: ProjectModEntry) {
    if (!data) return;
    const nextEntries = serializeEntries(data).map((item) =>
      item.workshopId === entry.workshopId ? { ...item, enabled: !entry.enabled } : item,
    );
    await persistEntries(nextEntries);
  }

  async function moveEntry(entry: ProjectModEntry, direction: -1 | 1) {
    if (!data) return;
    const entries = [...serializeEntries(data)];
    const index = entries.findIndex((item) => item.workshopId === entry.workshopId);
    const targetIndex = index + direction;
    if (index < 0 || targetIndex < 0 || targetIndex >= entries.length) return;
    const nextEntries = [...entries];
    const [current] = nextEntries.splice(index, 1);
    if (!current) return;
    nextEntries.splice(targetIndex, 0, current);
    await persistEntries(nextEntries.map((item, order) => ({ ...item, order })));
  }

  async function addRecommendationBundle(bundle: ModRecommendationBundle) {
    if (!data) return;
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
      setShowPrefetchLog(true);
      setStreamLines((current) => [
        ...current.slice(-119),
        { id: `local-${Date.now()}`, source: 'task', message: '[task.started] 已提交预拉取任务', timestamp: new Date().toISOString() },
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
    <div className="space-y-4">
      {/* ── 顶部工具栏 ── */}
      <Card>
        <CardContent className="pt-5">
          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-0 flex-1 space-y-1.5">
              <label className="text-xs uppercase tracking-[0.18em] text-muted-foreground">搜索 / 导入</label>
              <Input
                data-testid="mods-toolbar-input"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') void handleSearch(1); }}
                placeholder="关键词、Workshop 链接、合集链接或纯数字 ID"
              />
            </div>
            <div className="w-36 space-y-1.5">
              <label className="text-xs uppercase tracking-[0.18em] text-muted-foreground">筛选已选</label>
              <select
                value={filter}
                onChange={(event) => setFilter(event.target.value as SelectionFilter)}
                className="h-10 w-full rounded-xl border border-border bg-inset px-3 text-sm text-foreground outline-none transition-all focus:border-[hsl(var(--primary)/0.48)] focus:bg-panel"
              >
                <option value="all">全部</option>
                <option value="added">待预拉取</option>
                <option value="success">已就绪</option>
                <option value="failed">失败</option>
                <option value="disabled">已禁用</option>
              </select>
            </div>
            <div className="flex items-end gap-2 pb-0.5">
              <Button type="button" variant="secondary" disabled={searchBusy} onClick={() => void handleSearch(1)}>
                {searchBusy ? <LoaderCircle className="size-4 animate-spin" /> : <Search className="size-4" />}
                {looksLikeWorkshopInput(query) ? '导入' : '搜索'}
              </Button>
              <div className="flex items-center gap-1">
                <Button
                  data-testid="mods-prefetch-button"
                  type="button"
                  disabled={prefetchBusy || data.summary.totalSelected === 0 || saveBusy}
                  onClick={() => void handlePrefetch()}
                >
                  {prefetchBusy ? <LoaderCircle className="size-4 animate-spin" /> : <Download className="size-4" />}
                  预拉取
                </Button>
                <span
                  title="预拉取：在服务器停止状态下，提前让服务器把所有模组文件从 Steam Workshop 下载好，避免下次启动时等待下载。预拉取完成后再启动服务器，模组会立即生效。"
                  className="inline-flex cursor-help items-center text-muted-foreground hover:text-foreground"
                >
                  <HelpCircle className="size-4" />
                </span>
              </div>
            </div>
            {/* Stats */}
            <div className="flex items-center gap-2">
              <div className="rounded-xl border border-border bg-inset px-3 py-2 text-center" title="已启用的模组/合集总数">
                <div className="text-[11px] text-muted-foreground">启用</div>
                <div className="text-base font-semibold text-foreground">{data.summary.totalSelected}</div>
              </div>
              {data.entries.filter((e) => !e.enabled).length > 0 && (
                <div className="rounded-xl border border-border bg-inset px-3 py-2 text-center" title="已禁用（保留但不加载）">
                  <div className="text-[11px] text-muted-foreground">禁用</div>
                  <div className="text-base font-semibold text-muted-foreground">{data.entries.filter((e) => !e.enabled).length}</div>
                </div>
              )}
              <div className="rounded-xl border border-border bg-inset px-3 py-2 text-center" title="写入服务器配置的模组总数（含合集成员）">
                <div className="text-[11px] text-muted-foreground">已解析</div>
                <div className="text-base font-semibold text-foreground">{data.summary.resolvedModIds.length}</div>
              </div>
            </div>
          </div>
          {message ? <div className="mt-3 rounded-xl border border-border bg-inset/60 px-3 py-2 text-sm text-muted-foreground">{message}</div> : null}
        </CardContent>
      </Card>

      {/* ── 主内容双栏 ── */}
      <div className="grid gap-4 xl:grid-cols-2">
        {/* 左栏：搜索结果 / 推荐专栏（Tab 切换） */}
        <div className="space-y-0 overflow-hidden rounded-2xl border border-border bg-panel/96 shadow-panel">
          {/* Tab 头 */}
          <div className="flex border-b border-border">
            <button
              type="button"
              onClick={() => setLeftPanel('search')}
              className={`flex-1 px-4 py-3 text-sm font-medium transition ${leftPanel === 'search' ? 'border-b-2 border-primary text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
            >
              <Search className="mr-1.5 inline size-3.5" />
              搜索 / 导入结果
            </button>
            <button
              type="button"
              onClick={() => setLeftPanel('recommend')}
              className={`flex-1 px-4 py-3 text-sm font-medium transition ${leftPanel === 'recommend' ? 'border-b-2 border-primary text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
            >
              <Sparkles className="mr-1.5 inline size-3.5" />
              推荐专栏
            </button>
          </div>

          {/* 搜索结果面板 */}
          {leftPanel === 'search' && (
            <div className="space-y-3 p-4">
              {importResult ? (
                <div className="space-y-3">
                  <div className="rounded-xl border border-border bg-inset/60 px-3 py-2 text-sm text-muted-foreground">{importResult.message}</div>
                  {importResult.items.map((item, index) => (
                    <CatalogRow
                      key={`${item.workshopId}-${index}`}
                      item={item}
                      isAdded={addedIds.has(item.workshopId)}
                      actionLabel={index === 0 ? '加入项目' : '合集成员'}
                      disabled={index !== 0 || saveBusy}
                      onAction={index === 0 ? () => void addCatalogItem(item, importResult.type === 'collection' ? 'collection' : 'import') : undefined}
                    />
                  ))}
                </div>
              ) : searchResults.length > 0 ? (
                <div className="space-y-3">
                  {searchResults.map((item) => (
                    <CatalogRow
                      key={item.workshopId}
                      item={item}
                      isAdded={addedIds.has(item.workshopId)}
                      actionLabel="加入项目"
                      disabled={saveBusy}
                      onAction={() => void addCatalogItem(item, 'search')}
                    />
                  ))}
                  <Button type="button" variant="secondary" disabled={searchBusy} onClick={() => void handleSearch(searchPage + 1)}>
                    {searchBusy ? <LoaderCircle className="size-4 animate-spin" /> : <Search className="size-4" />}
                    加载更多
                  </Button>
                </div>
              ) : (
                <EmptyState
                  title="还没有搜索结果"
                  description="输入关键词可搜索 DST 模组，输入链接或纯数字 ID 会自动导入。"
                  icon={Search}
                />
              )}
            </div>
          )}

          {/* 推荐专栏面板 */}
          {leftPanel === 'recommend' && (
            <div className="p-4">
              <RecommendationBundlePanel
                bundles={recommendations ?? []}
                addedIds={addedIds}
                disabled={saveBusy}
                onAddItem={(item) => void addCatalogItem(item, 'recommendation')}
                onAddBundle={(bundle) => void addRecommendationBundle(bundle)}
              />
            </div>
          )}
        </div>

        {/* 右栏：当前模组 + 预拉取 */}
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <CardTitle>当前项目模组</CardTitle>
                  <CardDescription className="mt-0.5">开关控制是否写入服务器配置；移除则从列表删除。</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-2">
              {/* Collection block */}
              {data.collection ? (
                <div data-testid="mods-collection-block" className="rounded-xl border border-primary/20 bg-primary/5 px-3 py-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="rounded-full border border-primary/25 bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">合集</span>
                        <span className="truncate text-sm font-medium text-foreground">{data.collection.catalog.title}</span>
                      </div>
                      <div className="mt-0.5 text-xs text-muted-foreground">{data.collection.collectionMembers.length} 个成员</div>
                    </div>
                    <div className="flex shrink-0 items-center gap-1.5">
                      <CopyButton value={data.collection.catalog.sourceUrl} label="链接" />
                      <Button type="button" variant="ghost" size="sm" disabled={saveBusy} onClick={() => void removeEntry(data.collection!)} title="移除合集">
                        <Trash2 className="size-3.5" />
                      </Button>
                    </div>
                  </div>
                  {data.collection.collectionMembers.length > 0 && (
                    <div className="mt-2 space-y-1">
                      {data.collection.collectionMembers.map((item) => (
                        <div key={item.workshopId} className="flex items-center justify-between rounded-lg border border-border/60 bg-panel/70 px-2.5 py-1.5 text-xs">
                          <span className="truncate text-foreground">{item.title}</span>
                          <span className="ml-2 shrink-0 font-mono text-[10px] text-muted-foreground">{item.workshopId}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ) : null}

              {/* Mod list — compact rows */}
              <div data-testid="mods-selection-list" className="space-y-1.5">
                {visibleEntries.length > 0 ? (
                  visibleEntries.map((entry, index) => (
                    <div key={entry.id} className={`flex items-center gap-2 rounded-xl border px-3 py-2 transition-opacity ${entry.enabled ? 'border-border bg-panel/72' : 'border-border/50 bg-inset/40 opacity-60'}`}>
                      {entry.catalog.previewUrl && (
                        <img
                          src={entry.catalog.previewUrl}
                          alt={entry.catalog.title}
                          className="size-9 shrink-0 rounded-lg border border-border object-cover"
                          loading="lazy"
                          onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
                        />
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="truncate text-sm font-medium text-foreground">{entry.catalog.title}</span>
                          <SourcePill source={entry.source} />
                          {entry.enabled ? <PrefetchPill state={entry.prefetch.state} /> : (
                            <span className="rounded-full border border-border bg-inset px-1.5 py-0.5 text-[10px] text-muted-foreground">已禁用</span>
                          )}
                        </div>
                        <div className="mt-0.5 truncate font-mono text-[10px] text-muted-foreground">{entry.catalog.workshopId}</div>
                      </div>
                      <div className="flex shrink-0 items-center gap-1.5">
                        <Switch
                          checked={entry.enabled}
                          disabled={saveBusy}
                          onCheckedChange={() => void toggleEntry(entry)}
                          title={entry.enabled ? '点击禁用（保留在列表，不写入服务器配置）' : '点击启用'}
                        />
                        <Button type="button" variant="ghost" size="sm" disabled={saveBusy || index === 0} onClick={() => void moveEntry(entry, -1)} title="上移">
                          <ArrowUp className="size-3" />
                        </Button>
                        <Button type="button" variant="ghost" size="sm" disabled={saveBusy || index === visibleEntries.length - 1} onClick={() => void moveEntry(entry, 1)} title="下移">
                          <ArrowDown className="size-3" />
                        </Button>
                        <CopyButton value={entry.catalog.sourceUrl} label="" />
                        <Button type="button" variant="ghost" size="sm" disabled={saveBusy} onClick={() => void removeEntry(entry)} title="从列表删除">
                          <Trash2 className="size-3" />
                        </Button>
                      </div>
                    </div>
                  ))
                ) : (
                  <EmptyState title="项目里还没有单独安装的模组" description="从左侧搜索结果或推荐专栏加入。" icon={Boxes} />
                )}
              </div>
            </CardContent>
          </Card>

          {/* 预拉取预览 */}
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <CardTitle>预拉取</CardTitle>
                  <CardDescription className="mt-0.5 line-clamp-1">{prefetchStatus}</CardDescription>
                </div>
                <button
                  type="button"
                  onClick={() => setShowPrefetchLog((v) => !v)}
                  className="text-xs text-muted-foreground transition hover:text-foreground"
                >
                  {showPrefetchLog ? '收起日志' : '展开日志'}
                </button>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="rounded-xl border border-border bg-console">
                <div className="flex items-center justify-between gap-3 border-b border-white/5 px-3 py-2">
                  <div className="font-mono text-[11px] text-slate-200">dedicated_server_mods_setup.lua</div>
                  <CopyButton value={data.preview.modsSetup} label="复制" />
                </div>
                <pre data-testid="mods-preview-setup" className="max-h-48 overflow-auto px-4 py-3 font-mono text-[11px] leading-5 text-slate-200">
                  {data.preview.modsSetup}
                </pre>
              </div>

              {showPrefetchLog && (
                <div className="rounded-xl border border-border bg-console">
                  <div className="flex items-center justify-between gap-3 border-b border-white/5 px-3 py-2">
                    <div className="font-mono text-[11px] text-slate-200">prefetch logs</div>
                    <span className="font-mono text-[10px] text-slate-500">{streamLines.length} lines</span>
                  </div>
                  <div className="max-h-48 overflow-auto px-3 py-2 font-mono text-[11px] leading-5 text-slate-200">
                    {streamLines.length === 0 ? (
                      <div className="py-2 text-slate-500">还没有预拉取日志。</div>
                    ) : (
                      streamLines.map((line) => (
                        <div key={line.id} className="grid grid-cols-[72px_52px_minmax(0,1fr)] gap-2 border-b border-white/5 py-1 last:border-b-0">
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
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

/* ─── Recommendation Bundle Panel ─── */

function RecommendationBundlePanel({
  bundles,
  addedIds,
  disabled,
  onAddItem,
  onAddBundle,
}: {
  bundles: ModRecommendationBundle[];
  addedIds: Set<string>;
  disabled: boolean;
  onAddItem: (item: ModCatalogItem) => void;
  onAddBundle: (bundle: ModRecommendationBundle) => void;
}) {
  const [activeIndex, setActiveIndex] = useState(0);
  const safeIndex = Math.min(activeIndex, Math.max(0, bundles.length - 1));
  const bundle = bundles[safeIndex];

  if (!bundles.length) {
    return <EmptyState title="推荐列表为空" description="当前没能加载到预设模组数据。" icon={Sparkles} />;
  }

  const allAdded = bundle ? bundle.items.every((item) => addedIds.has(item.workshopId)) : false;

  return (
    <div className="space-y-4">
      {bundle && (
        <>
          {/* Bundle header */}
          <div className="flex items-start justify-between gap-3 rounded-xl border border-primary/20 bg-primary/5 px-4 py-3">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-foreground">{bundle.name}</span>
                <span className="rounded-full border border-primary/20 bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
                  {bundle.items.length} 个
                </span>
              </div>
              <div className="mt-0.5 text-xs text-muted-foreground">{bundle.description}</div>
              {bundle.items.some((i) => !i.serverSide) && (
                <div className="mt-1 text-[11px] text-muted-foreground/70">
                  <span className="text-sky-600 dark:text-sky-400">纯客户端</span> mod 无需服务器安装，玩家在 Steam 创意工坊自行订阅即可。
                </div>
              )}
            </div>
            <Button
              type="button"
              variant={allAdded ? 'secondary' : 'primary'}
              size="sm"
              disabled={disabled || allAdded}
              onClick={() => onAddBundle(bundle)}
              className="shrink-0"
            >
              {allAdded ? <><Check className="size-3.5" />已全部加入</> : <><PackagePlus className="size-3.5" />一键加入</>}
            </Button>
          </div>

          {/* Mod rows */}
          <div className="space-y-2">
            {bundle.items.map((item) => {
              const isAdded = addedIds.has(item.workshopId);
              return (
                <div key={item.workshopId} className="flex items-center gap-3 rounded-xl border border-border bg-panel/72 px-3 py-2.5">
                  {item.previewUrl && (
                    <img
                      src={item.previewUrl}
                      alt={item.title}
                      className="size-10 shrink-0 rounded-lg border border-border object-cover"
                      loading="lazy"
                      onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
                    />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="truncate text-sm font-medium text-foreground">{item.title}</span>
                      {item.serverSide ? (
                        <span className="shrink-0 rounded-full border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium text-amber-600 dark:text-amber-400">需服务端</span>
                      ) : (
                        <span className="shrink-0 rounded-full border border-sky-500/30 bg-sky-500/10 px-1.5 py-0.5 text-[10px] font-medium text-sky-600 dark:text-sky-400">纯客户端</span>
                      )}
                    </div>
                    {item.description ? (
                      <div className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{item.description}</div>
                    ) : item.author ? (
                      <div className="truncate text-xs text-muted-foreground">{item.author}</div>
                    ) : null}
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    <a
                      href={item.sourceUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-border bg-inset text-muted-foreground transition hover:text-foreground"
                    >
                      <ExternalLink className="size-3" />
                    </a>
                    {isAdded ? (
                      <span className="inline-flex h-7 items-center gap-1 rounded-lg border border-success/25 bg-success/10 px-2 text-[11px] font-medium text-success">
                        <Check className="size-3" />已加入
                      </span>
                    ) : (
                      <Button type="button" size="sm" variant="secondary" disabled={disabled} onClick={() => onAddItem(item)}>
                        <PackagePlus className="size-3.5" />
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* Pagination */}
      <div className="flex items-center justify-between border-t border-border pt-3">
        <button
          type="button"
          onClick={() => setActiveIndex((i) => Math.max(0, i - 1))}
          disabled={safeIndex === 0}
          className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border bg-inset px-3 text-xs text-muted-foreground transition hover:text-foreground disabled:opacity-40"
        >
          <ArrowLeft className="size-3.5" />上一个
        </button>
        <div className="flex items-center gap-2">
          {bundles.map((b, i) => (
            <button
              key={b.id}
              type="button"
              onClick={() => setActiveIndex(i)}
              title={b.name}
              className={`h-2 rounded-full transition-all ${i === safeIndex ? 'w-6 bg-primary' : 'w-2 bg-border hover:bg-muted-foreground'}`}
            />
          ))}
          <span className="ml-1 text-[11px] text-muted-foreground">{safeIndex + 1} / {bundles.length}</span>
        </div>
        <button
          type="button"
          onClick={() => setActiveIndex((i) => Math.min(bundles.length - 1, i + 1))}
          disabled={safeIndex === bundles.length - 1}
          className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border bg-inset px-3 text-xs text-muted-foreground transition hover:text-foreground disabled:opacity-40"
        >
          下一个<ArrowRight className="size-3.5" />
        </button>
      </div>
    </div>
  );
}

/* ─── Catalog Row ─── */

function CatalogRow({
  item,
  isAdded,
  actionLabel,
  disabled,
  onAction,
}: {
  item: ModCatalogItem;
  isAdded: boolean;
  actionLabel: string;
  disabled: boolean;
  onAction?: () => void;
}) {
  return (
    <div data-testid={`mod-search-result-${item.workshopId}`} className="rounded-2xl border border-border bg-panel/88 p-3">
      <div className="flex items-start gap-3">
        {item.previewUrl && (
          <img
            src={item.previewUrl}
            alt={item.title}
            className="size-12 shrink-0 rounded-xl border border-border object-cover"
            loading="lazy"
            onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
          />
        )}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="truncate text-sm font-medium text-foreground">{item.title}</span>
            {item.type === 'collection' && <SourcePill source="collection" />}
          </div>
          <div className="mt-0.5 text-xs text-muted-foreground">{item.author || '作者信息缺失'}</div>
          <div className="mt-1.5 flex flex-wrap gap-1">
            {item.tags.slice(0, 4).map((tag) => (
              <span key={tag} className="rounded-full border border-border bg-inset px-2 py-0.5 text-[10px] text-muted-foreground">{tag}</span>
            ))}
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1.5">
          <a
            href={item.sourceUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex h-7 items-center gap-1 rounded-lg border border-border bg-inset px-2.5 text-[11px] text-muted-foreground transition hover:text-foreground"
          >
            <ExternalLink className="size-3" />Steam
          </a>
          {isAdded ? (
            <span className="inline-flex h-7 items-center gap-1 rounded-lg border border-success/25 bg-success/10 px-2.5 text-[11px] font-medium text-success">
              <Check className="size-3" />已加入
            </span>
          ) : onAction ? (
            <Button type="button" size="sm" variant="secondary" disabled={disabled} onClick={onAction}>
              <PackagePlus className="size-3.5" />{actionLabel}
            </Button>
          ) : null}
        </div>
      </div>
      <div className="mt-2 flex items-center justify-between gap-3 text-[10px] text-muted-foreground">
        <span className="font-mono">{item.workshopId}</span>
        <span>{formatDateTime(item.updatedAt)}</span>
      </div>
    </div>
  );
}

/* ─── Pills ─── */

function SourcePill({ source }: { source: ModEntrySource }) {
  const labelMap: Record<ModEntrySource, string> = {
    search: '搜索',
    recommendation: '推荐',
    import: '导入',
    collection: '合集',
  };
  return (
    <span className="rounded-full border border-border bg-inset px-1.5 py-0.5 text-[10px] text-muted-foreground">
      {labelMap[source]}
    </span>
  );
}

function PrefetchPill({ state }: { state: ProjectModEntry['prefetch']['state'] }) {
  const labelMap = { not_added: '未加入', added: '待预拉取', success: '已就绪', failed: '失败' } as const;
  const toneMap = {
    not_added: 'border-border bg-inset text-muted-foreground',
    added: 'border-warning/25 bg-warning/10 text-warning',
    success: 'border-success/25 bg-success/10 text-success',
    failed: 'border-danger/25 bg-danger/10 text-danger',
  } as const;
  return <span className={`rounded-full border px-1.5 py-0.5 text-[10px] ${toneMap[state]}`}>{labelMap[state]}</span>;
}

/* ─── Empty State ─── */

function EmptyState({ title, description, icon: Icon }: { title: string; description: string; icon: typeof Search }) {
  return (
    <div className="rounded-2xl border border-border bg-inset/60 px-4 py-5 text-sm text-muted-foreground">
      <div className="flex items-center gap-2 text-foreground">
        <Icon className="size-4" />
        <span className="font-medium">{title}</span>
      </div>
      <div className="mt-1.5 leading-5">{description}</div>
    </div>
  );
}

/* ─── Helpers ─── */

function serializeEntries(detail: ProjectModsDetail): ProjectModEntryInput[] {
  const entries: ProjectModEntryInput[] = [];
  if (detail.collection) {
    entries.push({ workshopId: detail.collection.workshopId, type: detail.collection.type, source: detail.collection.source, enabled: detail.collection.enabled, order: 0 });
  }
  entries.push(
    ...detail.entries.map((entry, index) => ({
      workshopId: entry.workshopId, type: entry.type, source: entry.source, enabled: entry.enabled,
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
    if (!map.has(item.workshopId)) map.set(item.workshopId, item);
  }
  return Array.from(map.values());
}

function dedupeEntryInputs(entries: ProjectModEntryInput[]) {
  const enabledMap = new Map<string, ProjectModEntryInput>();
  let collectionEntry: ProjectModEntryInput | null = null;

  // First pass: collect enabled entries
  for (const entry of entries) {
    if (!entry.enabled) continue;
    if (entry.type === 'collection') {
      if (!collectionEntry) collectionEntry = entry;
      continue;
    }
    if (!enabledMap.has(entry.workshopId)) enabledMap.set(entry.workshopId, entry);
  }

  // Second pass: collect disabled entries that don't conflict with enabled ones
  const disabledMap = new Map<string, ProjectModEntryInput>();
  for (const entry of entries) {
    if (entry.enabled) continue;
    if (entry.type === 'collection') continue; // skip disabled collections in dedup
    if (!enabledMap.has(entry.workshopId) && !disabledMap.has(entry.workshopId)) {
      disabledMap.set(entry.workshopId, entry);
    }
  }

  const enabledList = [
    ...(collectionEntry ? [{ ...collectionEntry, order: 0 }] : []),
    ...Array.from(enabledMap.values()),
  ].map((entry, index) => ({ ...entry, order: index }));

  const disabledList = Array.from(disabledMap.values()).map((entry, index) => ({
    ...entry, order: enabledList.length + index,
  }));

  return [...enabledList, ...disabledList];
}

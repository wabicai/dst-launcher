'use client';

import { useMemo, useState } from 'react';
import {
  DEFAULT_PROJECT_NAME,
  DEFAULT_PROJECT_SLUG,
  createDefaultClusterConfig,
  createDefaultProjectInput,
  createDefaultTargetConfig,
  createProjectSlug,
  createRemoteDeployPath,
  renderConfigPreview,
  type ClusterConfig,
  type ProjectDetail,
  type SshTargetConfig,
  type TargetConfig,
} from '@dst-launcher/shared';
import { parseLineValues, stringifyLineValues } from '@/lib/forms';
import { Button } from './ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Switch } from './ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { Textarea } from './ui/textarea';
import { Separator } from './ui/separator';

export type ProjectFormValue = {
  name: string;
  slug: string;
  description: string;
  target: TargetConfig;
  clusterConfig: ClusterConfig;
};

type AutoSyncState = {
  slugTouched: boolean;
  clusterNameTouched: boolean;
  remotePathTouched: boolean;
};

interface ProjectFormProps {
  mode: 'create' | 'edit';
  initialProject?: ProjectDetail;
  onSubmit: (value: ProjectFormValue) => Promise<void>;
  onTestTarget?: (target: TargetConfig) => Promise<void>;
  busy?: boolean;
}

export function ProjectForm({ mode, initialProject, onSubmit, onTestTarget, busy = false }: ProjectFormProps) {
  const initialValue: ProjectFormValue = initialProject
    ? {
        name: initialProject.name,
        slug: initialProject.slug,
        description: initialProject.description,
        target: initialProject.target,
        clusterConfig: initialProject.clusterConfig,
      }
    : (() => {
        const defaults = createDefaultProjectInput();
        return {
          ...defaults,
          clusterConfig: defaults.clusterConfig ?? createDefaultClusterConfig(DEFAULT_PROJECT_NAME),
        };
      })();

  const [message, setMessage] = useState<string>('');
  const [autoSyncState, setAutoSyncState] = useState<AutoSyncState>({
    slugTouched: mode === 'edit',
    clusterNameTouched: mode === 'edit',
    remotePathTouched: mode === 'edit',
  });
  const [state, setState] = useState<ProjectFormValue>(initialValue);

  const preview = useMemo(() => renderConfigPreview(state.clusterConfig), [state.clusterConfig]);

  function updateCluster(patch: Partial<ClusterConfig>) {
    setState((current) => ({
      ...current,
      clusterConfig: {
        ...current.clusterConfig,
        ...patch,
      },
    }));
  }

  function updateShard(shard: 'master' | 'caves', patch: Partial<ClusterConfig['master']>) {
    setState((current) => ({
      ...current,
      clusterConfig: {
        ...current.clusterConfig,
        [shard]: {
          ...current.clusterConfig[shard],
          ...patch,
        },
      },
    }));
  }

  function ensureSshTarget(current: TargetConfig, slug: string): SshTargetConfig {
    if (current.type === 'ssh') {
      return {
        ...current,
        remotePath: current.remotePath?.trim() || createRemoteDeployPath(slug),
      };
    }

    return {
      type: 'ssh',
      host: '',
      port: 22,
      username: 'root',
      privateKeyPath: '~/.ssh/id_ed25519',
      remotePath: createRemoteDeployPath(slug),
    };
  }

  function updateTarget(patch: Partial<TargetConfig>) {
    setState((current) => ({
      ...current,
      target:
        current.target.type === 'local'
          ? ({ ...current.target, ...patch, type: 'local' } as TargetConfig)
          : ({ ...current.target, ...patch, type: 'ssh' } as TargetConfig),
    }));
  }

  function handleNameChange(name: string) {
    setState((current) => {
      const nextSlug = mode === 'create' && !autoSyncState.slugTouched ? createProjectSlug(name, current.slug || DEFAULT_PROJECT_SLUG) : current.slug;
      const nextTarget =
        current.target.type === 'ssh' && !autoSyncState.remotePathTouched
          ? { ...current.target, remotePath: createRemoteDeployPath(nextSlug) }
          : current.target;

      return {
        ...current,
        name,
        slug: nextSlug,
        target: nextTarget,
        clusterConfig: {
          ...current.clusterConfig,
          clusterName: mode === 'create' && !autoSyncState.clusterNameTouched ? name.trim() || DEFAULT_PROJECT_NAME : current.clusterConfig.clusterName,
        },
      };
    });
  }

  function handleSlugChange(value: string) {
    const nextSlug = createProjectSlug(value, '');
    setAutoSyncState((current) => ({ ...current, slugTouched: true }));
    setState((current) => ({
      ...current,
      slug: nextSlug,
      target:
        current.target.type === 'ssh' && !autoSyncState.remotePathTouched
          ? { ...current.target, remotePath: createRemoteDeployPath(nextSlug || DEFAULT_PROJECT_SLUG) }
          : current.target,
    }));
  }

  async function handleSubmit() {
    setMessage('');
    await onSubmit(state);
  }

  async function handleTestTarget() {
    if (!onTestTarget) return;
    try {
      await onTestTarget(state.target);
      setMessage('目标连接测试通过');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '目标连接测试失败');
    }
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[1.25fr_0.95fr]">
      <Card>
        <CardHeader>
          <CardTitle>{mode === 'create' ? '创建新项目' : '项目配置'}</CardTitle>
          <CardDescription>面向单人开发的结构化配置流，先把最常用参数跑通，再逐步增强自动化。</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="项目名称" hint={mode === 'create' ? '新建时会自动联动房间名、Slug 和默认远程目录。' : undefined}>
              <Input data-testid="project-name-input" value={state.name} onChange={(event) => handleNameChange(event.target.value)} />
            </Field>
            <Field label="项目 Slug" hint={mode === 'create' ? '默认自动生成；你也可以手动覆盖，输入会自动规范化。' : '创建后保持稳定，避免影响部署目录与运行标识。'}>
              <Input data-testid="project-slug-input" value={state.slug} disabled={mode === 'edit'} onChange={(event) => handleSlugChange(event.target.value)} />
            </Field>
          </div>
          <Field label="项目说明">
            <Textarea value={state.description} onChange={(event) => setState((current) => ({ ...current, description: event.target.value }))} />
          </Field>
          <Separator />
          <Tabs defaultValue="target">
            <TabsList>
              <TabsTrigger value="target">Target</TabsTrigger>
              <TabsTrigger value="cluster">Cluster</TabsTrigger>
              <TabsTrigger value="ports">Ports</TabsTrigger>
            </TabsList>
            <TabsContent value="target" className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <Field label="模式" hint="本地模式直连 Docker Desktop；远程模式通过 SSH 管理 VPS Docker。">
                  <select
                    data-testid="target-mode-select"
                    className="h-11 w-full rounded-xl border border-border bg-card/80 px-3 text-sm"
                    value={state.target.type}
                    onChange={(event) => {
                      if (event.target.value === 'local') {
                        setState((current) => ({ ...current, target: createDefaultTargetConfig() }));
                        return;
                      }

                      setState((current) => ({
                        ...current,
                        target: ensureSshTarget(current.target, current.slug || DEFAULT_PROJECT_SLUG),
                      }));
                    }}
                  >
                    <option value="local">本地 Docker</option>
                    <option value="ssh">远程 SSH + Docker</option>
                  </select>
                </Field>
                {state.target.type === 'local' ? (
                  <Field label="Docker Context" hint="默认使用 Docker Desktop 的 desktop-linux context。">
                    <Input value={state.target.dockerContext} onChange={(event) => updateTarget({ dockerContext: event.target.value })} />
                  </Field>
                ) : (
                  <Field label="远程部署目录" hint="默认跟随项目 Slug 生成；手动改过后将不再自动覆盖。">
                    <Input
                      data-testid="remote-path-input"
                      value={state.target.remotePath}
                      onChange={(event) => {
                        setAutoSyncState((current) => ({ ...current, remotePathTouched: true }));
                        updateTarget({ remotePath: event.target.value });
                      }}
                    />
                  </Field>
                )}
              </div>
              {state.target.type === 'ssh' && (
                <div className="space-y-4">
                  <div className="rounded-2xl border border-accent/20 bg-accent/10 px-4 py-3 text-sm leading-6 text-muted-foreground">
                    远程模式默认面向 `Ubuntu + Docker + UFW`。`部署` / `启动` 时，Launcher 会先检查并尽量放通当前项目所需的 6 个 UDP 端口；如果目标机没有 UFW，工作区会明确提示你手动处理防火墙。
                  </div>
                  <div className="grid gap-4 md:grid-cols-2">
                    <Field label="主机">
                      <Input value={state.target.host} onChange={(event) => updateTarget({ host: event.target.value })} />
                    </Field>
                    <Field label="端口">
                      <Input type="number" value={state.target.port} onChange={(event) => updateTarget({ port: Number(event.target.value) })} />
                    </Field>
                    <Field label="用户名">
                      <Input value={state.target.username} onChange={(event) => updateTarget({ username: event.target.value })} />
                    </Field>
                    <Field label="私钥路径">
                      <Input value={state.target.privateKeyPath} onChange={(event) => updateTarget({ privateKeyPath: event.target.value })} />
                    </Field>
                  </div>
                </div>
              )}
              <div className="flex flex-wrap gap-3">
                <Button variant="secondary" onClick={handleTestTarget} type="button">
                  测试连接
                </Button>
              </div>
            </TabsContent>
            <TabsContent value="cluster" className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <Field label="房间名称" hint={mode === 'create' ? '默认跟随项目名称；如果单独修改，后续将按你的手动值保留。' : undefined}>
                  <Input
                    data-testid="cluster-name-input"
                    value={state.clusterConfig.clusterName}
                    onChange={(event) => {
                      setAutoSyncState((current) => ({ ...current, clusterNameTouched: true }));
                      updateCluster({ clusterName: event.target.value });
                    }}
                  />
                </Field>
                <Field label="房间密码">
                  <Input value={state.clusterConfig.clusterPassword} onChange={(event) => updateCluster({ clusterPassword: event.target.value })} />
                </Field>
                <Field label="游戏模式">
                  <select className="h-11 w-full rounded-xl border border-border bg-card/80 px-3 text-sm" value={state.clusterConfig.gameMode} onChange={(event) => updateCluster({ gameMode: event.target.value as ClusterConfig['gameMode'] })}>
                    <option value="survival">survival</option>
                    <option value="endless">endless</option>
                    <option value="wilderness">wilderness</option>
                  </select>
                </Field>
                <Field label="房间倾向">
                  <select className="h-11 w-full rounded-xl border border-border bg-card/80 px-3 text-sm" value={state.clusterConfig.clusterIntention} onChange={(event) => updateCluster({ clusterIntention: event.target.value as ClusterConfig['clusterIntention'] })}>
                    <option value="cooperative">cooperative</option>
                    <option value="competitive">competitive</option>
                    <option value="social">social</option>
                    <option value="madness">madness</option>
                  </select>
                </Field>
                <Field label="最大玩家数">
                  <Input type="number" value={state.clusterConfig.maxPlayers} onChange={(event) => updateCluster({ maxPlayers: Number(event.target.value) })} />
                </Field>
                <Field label="Klei Token" hint="真实部署前必填；如果 Token 缺失或无效，DST 容器通常无法稳定保持在线。">
                  <Input value={state.clusterConfig.clusterToken} onChange={(event) => updateCluster({ clusterToken: event.target.value })} />
                </Field>
              </div>
              <Field label="房间说明">
                <Textarea value={state.clusterConfig.clusterDescription} onChange={(event) => updateCluster({ clusterDescription: event.target.value })} />
              </Field>
              <div className="grid gap-4 md:grid-cols-3">
                <ToggleField label="PVP" checked={state.clusterConfig.pvp} onCheckedChange={(value) => updateCluster({ pvp: value })} />
                <ToggleField label="空房暂停" checked={state.clusterConfig.pauseWhenEmpty} onCheckedChange={(value) => updateCluster({ pauseWhenEmpty: value })} />
                <ToggleField label="离线集群" checked={state.clusterConfig.offlineCluster} onCheckedChange={(value) => updateCluster({ offlineCluster: value })} />
              </div>
              <Field label="模组集合 ID">
                <Input value={state.clusterConfig.modCollection} onChange={(event) => updateCluster({ modCollection: event.target.value })} />
              </Field>
              <div className="grid gap-4 md:grid-cols-2">
                <Field label="单独模组 ID（逗号或换行分隔）">
                  <Textarea value={stringifyLineValues(state.clusterConfig.modIds)} onChange={(event) => updateCluster({ modIds: parseLineValues(event.target.value) })} />
                </Field>
                <Field label="管理员 Klei ID（逗号或换行分隔）">
                  <Textarea value={stringifyLineValues(state.clusterConfig.adminIds)} onChange={(event) => updateCluster({ adminIds: parseLineValues(event.target.value) })} />
                </Field>
              </div>
            </TabsContent>
            <TabsContent value="ports" className="space-y-4">
              <div className="rounded-2xl border border-border bg-card/30 px-4 py-3 text-sm leading-6 text-muted-foreground">
                当前会通过 `docker-compose.yml` 直接对外暴露 Master / Caves 的 6 个 UDP 端口。远程模式下，工作区会把这里的端口集合与 UFW 放通状态联动展示。
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <ShardPortFields title="主世界 Master" shard={state.clusterConfig.master} onChange={(patch) => updateShard('master', patch)} />
                <ShardPortFields title="洞穴 Caves" shard={state.clusterConfig.caves} onChange={(patch) => updateShard('caves', patch)} />
              </div>
            </TabsContent>
          </Tabs>
          {message ? <p className="rounded-2xl border border-border bg-muted/50 px-4 py-3 text-sm text-muted-foreground">{message}</p> : null}
          <div className="flex flex-wrap gap-3">
            <Button data-testid="project-submit-button" onClick={handleSubmit} disabled={busy}>{busy ? '处理中...' : mode === 'create' ? '创建项目' : '保存配置'}</Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>渲染预览</CardTitle>
          <CardDescription>侧边直接预览即将写入磁盘的配置文件，方便排查 cluster 与 shard 差异。</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {Object.entries(preview).map(([file, content]) => (
            <div key={file} className="overflow-hidden rounded-2xl border border-border bg-[#0f1220]">
              <div className="border-b border-white/5 px-4 py-3 text-xs uppercase tracking-[0.18em] text-slate-400">{file}</div>
              <pre data-testid={file === 'cluster.ini' ? 'preview-cluster-ini' : undefined} className="max-h-64 overflow-auto p-4 text-xs leading-6 text-slate-200">{content}</pre>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <div className="space-y-1">
        <Label>{label}</Label>
        {hint ? <p className="text-xs leading-5 text-muted-foreground">{hint}</p> : null}
      </div>
      {children}
    </div>
  );
}

function ToggleField({ label, checked, onCheckedChange }: { label: string; checked: boolean; onCheckedChange: (value: boolean) => void }) {
  return (
    <div className="flex items-center justify-between rounded-2xl border border-border bg-card/60 px-4 py-4">
      <div>
        <div className="font-medium text-foreground">{label}</div>
        <div className="text-sm text-muted-foreground">切换后会即时更新 cluster 配置预览。</div>
      </div>
      <Switch checked={checked} onCheckedChange={onCheckedChange} />
    </div>
  );
}

function ShardPortFields({ title, shard, onChange }: { title: string; shard: ClusterConfig['master']; onChange: (patch: Partial<ClusterConfig['master']>) => void }) {
  return (
    <div className="rounded-3xl border border-border bg-card/40 p-5">
      <div className="mb-4 font-display text-lg">{title}</div>
      <div className="grid gap-4">
        <Field label="Shard 名称">
          <Input value={shard.shardName} onChange={(event) => onChange({ shardName: event.target.value })} />
        </Field>
        <Field label="游戏端口">
          <Input type="number" value={shard.serverPort} onChange={(event) => onChange({ serverPort: Number(event.target.value) })} />
        </Field>
        <Field label="Master Server Port">
          <Input type="number" value={shard.masterServerPort} onChange={(event) => onChange({ masterServerPort: Number(event.target.value) })} />
        </Field>
        <Field label="Authentication Port">
          <Input type="number" value={shard.authenticationPort} onChange={(event) => onChange({ authenticationPort: Number(event.target.value) })} />
        </Field>
      </div>
    </div>
  );
}

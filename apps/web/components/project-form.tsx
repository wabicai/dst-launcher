'use client';

import { useMemo, useState } from 'react';
import { ChevronDown, ChevronUp, Layers3, ServerCog, Shield, Sparkles } from 'lucide-react';
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
import { CopyButton } from './copy-button';
import { Button } from './ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Switch } from './ui/switch';
import { Textarea } from './ui/textarea';

export type ProjectFormValue = {
  name: string;
  slug: string;
  description: string;
  target: TargetConfig;
  clusterConfig: ClusterConfig;
};

type AutoSyncState = {
  remotePathTouched: boolean;
};

interface ProjectFormProps {
  mode: 'create' | 'edit';
  initialProject?: ProjectDetail;
  onSubmit: (value: ProjectFormValue) => Promise<void>;
  onTestTarget?: (target: TargetConfig) => Promise<void>;
  busy?: boolean;
}

const selectClassName =
  'h-10 w-full rounded-xl border border-border bg-inset px-3 text-sm text-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.02)] outline-none transition-all hover:border-[hsl(var(--primary)/0.18)] focus:border-[hsl(var(--primary)/0.48)] focus:bg-panel focus:ring-4 focus:ring-[hsl(var(--primary)/0.1)]';

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

  const [message, setMessage] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [autoSyncState, setAutoSyncState] = useState<AutoSyncState>({
    remotePathTouched: mode === 'edit',
  });
  const [state, setState] = useState<ProjectFormValue>(initialValue);

  const preview = useMemo(() => renderConfigPreview(state.clusterConfig), [state.clusterConfig]);
  const requiredUdpPorts = useMemo(() => {
    const ports = [
      state.clusterConfig.master.serverPort,
      state.clusterConfig.master.masterServerPort,
      state.clusterConfig.master.authenticationPort,
      state.clusterConfig.caves.serverPort,
      state.clusterConfig.caves.masterServerPort,
      state.clusterConfig.caves.authenticationPort,
    ];

    return Array.from(new Set(ports));
  }, [state.clusterConfig]);
  const completionHints = useMemo(() => {
    const issues: string[] = [];

    if (!state.clusterConfig.clusterToken.trim()) {
      issues.push('Klei Token');
    }

    if (state.target.type === 'ssh') {
      if (!state.target.host.trim()) {
        issues.push('SSH 主机');
      }

      if (!state.target.remotePath.trim()) {
        issues.push('远程目录');
      }
    }

    return issues;
  }, [state.clusterConfig.clusterToken, state.target]);
  const modSummary = useMemo(() => {
    const collectionId = state.clusterConfig.modCollection.trim();
    const modCount = state.clusterConfig.modIds.filter((item) => item.trim()).length;
    if (!collectionId && modCount === 0) {
      return '未配置';
    }
    if (collectionId && modCount === 0) {
      return '已导入 1 个合集';
    }
    if (collectionId) {
      return `已导入合集 + ${modCount} 个单独模组`;
    }
    return `已选 ${modCount} 个模组`;
  }, [state.clusterConfig.modCollection, state.clusterConfig.modIds]);

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
      const slug = mode === 'create' ? createProjectSlug(name, current.slug || DEFAULT_PROJECT_SLUG) : current.slug;
      const nextTarget =
        current.target.type === 'ssh' && !autoSyncState.remotePathTouched
          ? { ...current.target, remotePath: createRemoteDeployPath(slug) }
          : current.target;

      return {
        ...current,
        name,
        slug,
        target: nextTarget,
        clusterConfig: {
          ...current.clusterConfig,
          clusterName: name.trim() || DEFAULT_PROJECT_NAME,
        },
      };
    });
  }

  async function handleSubmit() {
    setMessage('');
    try {
      await onSubmit(state);
      if (mode === 'edit') {
        setMessage('配置已保存。重启服务器后生效。');
      }
    } catch (error) {
      setMessage(error instanceof Error ? `保存失败：${error.message}` : '保存失败。');
    }
  }

  async function handleTestTarget() {
    if (!onTestTarget) {
      return;
    }

    try {
      await onTestTarget(state.target);
      setMessage('连接测试通过。');
    } catch (error) {
      setMessage(error instanceof Error ? `连接测试失败：${error.message}` : '连接测试失败。');
    }
  }

  const deployTargetValue = state.target.type === 'local' ? `Docker Context · ${state.target.dockerContext}` : state.target.remotePath;

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
      <div className="space-y-3">
        <FormSection icon={ServerCog} step="01" title="部署目标" description="先决定项目运行在哪里。">
          <Subsection title="连接方式" eyebrow="Connection" hint="先选本地或远程">
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="模式">
                <select
                  data-testid="target-mode-select"
                  className={selectClassName}
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
                <Field label="Docker Context" meta={<MetaBadge>常用</MetaBadge>}>
                  <Input value={state.target.dockerContext} onChange={(event) => updateTarget({ dockerContext: event.target.value })} placeholder="desktop-linux" />
                </Field>
              ) : (
                <Field label="远程目录" actions={<AutoSyncBadge mode={mode} touched={autoSyncState.remotePathTouched} autoLabel="自动" manualLabel="已改" />}>
                  <div className="flex gap-2">
                    <Input
                      data-testid="remote-path-input"
                      value={state.target.remotePath}
                      onChange={(event) => {
                        setAutoSyncState((current) => ({ ...current, remotePathTouched: true }));
                        updateTarget({ remotePath: event.target.value });
                      }}
                      placeholder="~/dst-launcher/my-cluster"
                    />
                    <CopyButton value={state.target.remotePath} label="复制" />
                  </div>
                </Field>
              )}
            </div>
          </Subsection>

          {state.target.type === 'ssh' ? (
            <Subsection title="SSH 参数" eyebrow="Remote" hint="只在 SSH 模式下显示">
              <div className="grid gap-4 md:grid-cols-2">
                <Field label="主机" meta={<MetaBadge tone="primary">必填</MetaBadge>}>
                  <Input value={state.target.host} onChange={(event) => updateTarget({ host: event.target.value })} placeholder="onekey-vps" />
                </Field>
                <Field label="端口">
                  <Input type="number" value={state.target.port} onChange={(event) => updateTarget({ port: Number(event.target.value) })} placeholder="22" />
                </Field>
                <Field label="用户名">
                  <Input value={state.target.username} onChange={(event) => updateTarget({ username: event.target.value })} placeholder="root" />
                </Field>
                <Field label="私钥路径">
                  <Input value={state.target.privateKeyPath} onChange={(event) => updateTarget({ privateKeyPath: event.target.value })} placeholder="~/.ssh/id_ed25519" />
                </Field>
              </div>
            </Subsection>
          ) : null}

          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-inset/50 px-4 py-3">
            <div>
              <div className="text-sm font-medium text-foreground">连接测试</div>
              <div className="mt-1 text-xs text-muted-foreground">先确认 Docker 或 SSH 可用，再继续创建或保存。</div>
            </div>
            <Button variant="secondary" onClick={handleTestTarget} type="button">
              测试连接
            </Button>
          </div>
        </FormSection>

        <FormSection icon={Layers3} step="02" title="房间配置" description="把名称、访问方式和房间资料收敛到一处。">
          <Subsection title="基础信息" eyebrow="Identity" hint="项目标识">
            <Field label="服务器名称" meta={<MetaBadge tone="primary">必填</MetaBadge>} hint="玩家在服务器列表里搜索这个名字。">
              <Input data-testid="project-name-input" value={state.name} onChange={(event) => handleNameChange(event.target.value)} placeholder="例如：OneKey 社群服" />
            </Field>
            <Field label="项目说明" meta={<MetaBadge>可选</MetaBadge>} hint="备注这个项目是正式服、测试服还是临时服。">
              <Textarea
                value={state.description}
                onChange={(event) => setState((current) => ({ ...current, description: event.target.value }))}
                placeholder="例如：正式服 / 周末测试服 / 仅好友联机"
              />
            </Field>
          </Subsection>

          <Subsection title="房间资料" eyebrow="Room" hint="玩家可见">
            <div className="grid gap-4 md:grid-cols-3">
              <Field label="房间密码" meta={<MetaBadge>可选</MetaBadge>}>
                <Input value={state.clusterConfig.clusterPassword} onChange={(event) => updateCluster({ clusterPassword: event.target.value })} placeholder="留空则公开" />
              </Field>
              <Field label="最大玩家数" meta={<MetaBadge>常用</MetaBadge>}>
                <Input type="number" value={state.clusterConfig.maxPlayers} onChange={(event) => updateCluster({ maxPlayers: Number(event.target.value) })} placeholder="6" />
              </Field>
              <Field label="Klei Token" meta={<MetaBadge tone="primary">部署前必填</MetaBadge>} hint="用于官方服务注册；现在可以先创建，部署前补齐即可。">
                <Input value={state.clusterConfig.clusterToken} onChange={(event) => updateCluster({ clusterToken: event.target.value })} placeholder="粘贴 DST_KLEI_TOKEN" />
              </Field>
            </div>
            <Field label="房间说明" meta={<MetaBadge>可选</MetaBadge>}>
              <Textarea
                value={state.clusterConfig.clusterDescription}
                onChange={(event) => updateCluster({ clusterDescription: event.target.value })}
                placeholder="例如：常驻双分片、生存模式、轻量模组、欢迎新玩家"
              />
            </Field>
          </Subsection>

          <Subsection title="模组摘要" eyebrow="Mods" hint="完整管理请到工作区">
            <div className="rounded-2xl border border-border bg-panel/72 px-4 py-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-medium text-foreground">{modSummary}</div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    创建页只保留摘要与兼容层输入；搜索、推荐、导入和预拉取都在工作区的模组工作台里完成。
                  </div>
                </div>
                <div className="rounded-full border border-border bg-inset px-3 py-1 font-mono text-[11px] text-muted-foreground">
                  {state.clusterConfig.modCollection.trim() ? '含合集' : '无合集'}
                </div>
              </div>
            </div>
          </Subsection>

          <div className="rounded-2xl border border-border bg-inset/50 px-4 py-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-medium text-foreground">高级选项</div>
                <div className="mt-1 text-xs text-muted-foreground">游戏模式、模组和管理员列表。</div>
              </div>
              <Button type="button" variant="ghost" size="sm" onClick={() => setShowAdvanced((current) => !current)}>
                {showAdvanced ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
                {showAdvanced ? '收起' : '展开'}
              </Button>
            </div>
          </div>

          {showAdvanced ? (
            <Subsection title="高级设置" eyebrow="Advanced" hint="按需展开">
              <div className="grid gap-4 md:grid-cols-2">
                <Field label="游戏模式">
                  <select className={selectClassName} value={state.clusterConfig.gameMode} onChange={(event) => updateCluster({ gameMode: event.target.value as ClusterConfig['gameMode'] })}>
                    <option value="survival">survival</option>
                    <option value="endless">endless</option>
                    <option value="wilderness">wilderness</option>
                  </select>
                </Field>
                <Field label="房间倾向">
                  <select className={selectClassName} value={state.clusterConfig.clusterIntention} onChange={(event) => updateCluster({ clusterIntention: event.target.value as ClusterConfig['clusterIntention'] })}>
                    <option value="cooperative">cooperative</option>
                    <option value="competitive">competitive</option>
                    <option value="social">social</option>
                    <option value="madness">madness</option>
                  </select>
                </Field>
              </div>

              <div className="grid gap-4 md:grid-cols-3">
                <ToggleField label="PVP" checked={state.clusterConfig.pvp} onCheckedChange={(value) => updateCluster({ pvp: value })} />
                <ToggleField label="空房暂停" checked={state.clusterConfig.pauseWhenEmpty} onCheckedChange={(value) => updateCluster({ pauseWhenEmpty: value })} />
                <ToggleField label="离线集群" checked={state.clusterConfig.offlineCluster} onCheckedChange={(value) => updateCluster({ offlineCluster: value })} />
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <Field label="管理员 Klei ID">
                  <Textarea value={stringifyLineValues(state.clusterConfig.adminIds)} onChange={(event) => updateCluster({ adminIds: parseLineValues(event.target.value) })} placeholder="每行一个 Klei ID" />
                </Field>
              </div>

              <div className="rounded-2xl border border-border bg-panel/72 p-4">
                <div className="mb-4 flex items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-medium text-foreground">专家模式 / 原始 Workshop 输入</div>
                    <div className="mt-1 text-xs text-muted-foreground">兼容现有测试数据和手动输入；推荐后续改到工作区的模组工作台操作。</div>
                  </div>
                  <MetaBadge>兼容层</MetaBadge>
                </div>
                <div className="space-y-4">
                  <Field label="模组集合 ID" meta={<MetaBadge>可选</MetaBadge>}>
                    <Input value={state.clusterConfig.modCollection} onChange={(event) => updateCluster({ modCollection: event.target.value })} placeholder="例如：3224789100" />
                  </Field>
                  <Field label="单独模组 ID">
                    <Textarea value={stringifyLineValues(state.clusterConfig.modIds)} onChange={(event) => updateCluster({ modIds: parseLineValues(event.target.value) })} placeholder="每行一个 mod ID" />
                  </Field>
                </div>
              </div>
            </Subsection>
          ) : null}
        </FormSection>

        <FormSection icon={Shield} step="03" title="网络与端口" description="双分片固定为 Master + Caves。">
          <div className="grid gap-4 xl:grid-cols-2">
            <ShardPortFields title="Master" shard={state.clusterConfig.master} onChange={(patch) => updateShard('master', patch)} />
            <ShardPortFields title="Caves" shard={state.clusterConfig.caves} onChange={(patch) => updateShard('caves', patch)} />
          </div>
        </FormSection>

        <div className="sticky bottom-4 z-10 rounded-2xl border border-border bg-panel/96 p-4 shadow-panel backdrop-blur">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="text-sm font-medium text-foreground">准备提交</div>
              <div className="mt-1 text-xs text-muted-foreground">
                {message ||
                  (completionHints.length > 0
                    ? `还缺 ${completionHints.join('、')}。现在可以先保存，真正部署前补齐即可。`
                    : mode === 'create'
                      ? '主要信息已经齐了；创建后会直接进入工作区。'
                      : '修改完成后点击保存，重启服务器后生效。')}
              </div>
            </div>
            <div className="flex items-center gap-2">
              {completionHints.length > 0 ? <MetaBadge tone="muted">待补 {completionHints.length} 项</MetaBadge> : null}
              <Button data-testid="project-submit-button" size="lg" onClick={handleSubmit} disabled={busy}>
                <Sparkles className="size-4" />
                {busy ? '处理中...' : mode === 'create' ? '创建并进入工作区' : '保存变更'}
              </Button>
            </div>
          </div>
        </div>
      </div>

      <div data-testid="project-form-preview" className="space-y-4 xl:sticky xl:top-5 xl:self-start">
        <Card>
          <CardHeader>
            <CardTitle>实时预览</CardTitle>
            <CardDescription>路径、端口和最终文件。</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <PreviewMetaRow label="项目 Slug" value={state.slug || DEFAULT_PROJECT_SLUG} copyValue={state.slug || DEFAULT_PROJECT_SLUG} />
            <PreviewMetaRow label="部署目标" value={deployTargetValue} copyValue={deployTargetValue} />
            <div className="rounded-2xl border border-border bg-inset/60 px-4 py-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">UDP</div>
                  <div className="mt-1 text-sm text-foreground">{requiredUdpPorts.length} 个端口</div>
                </div>
                <CopyButton value={requiredUdpPorts.join(', ')} label="复制" />
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {requiredUdpPorts.map((port) => (
                  <span key={port} className="rounded-full border border-border bg-panel px-3 py-1 font-mono text-[12px] text-foreground">
                    {port}/udp
                  </span>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        {Object.entries(preview).map(([file, content]) => (
          <PreviewBlock key={file} file={file} content={content} testId={file === 'cluster.ini' ? 'preview-cluster-ini' : undefined} />
        ))}
      </div>
    </div>
  );
}

function FormSection({
  icon: Icon,
  step,
  title,
  description,
  children,
}: {
  icon: typeof ServerCog;
  step: string;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-start gap-3">
          <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-xl border border-border bg-inset text-primary">
            <Icon className="size-4" />
          </span>
          <div className="min-w-0">
            <div className="mb-1 flex items-center gap-2">
              <span className="rounded-full border border-border bg-inset px-2 py-1 font-mono text-[11px] text-muted-foreground">{step}</span>
              <CardTitle>{title}</CardTitle>
            </div>
            <CardDescription>{description}</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">{children}</CardContent>
    </Card>
  );
}

function Subsection({
  title,
  eyebrow,
  hint,
  children,
}: {
  title: string;
  eyebrow: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-border bg-inset/35 p-4">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <div className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">{eyebrow}</div>
          <div className="mt-1 text-sm font-medium text-foreground">{title}</div>
        </div>
        {hint ? <span className="rounded-full border border-border bg-panel/72 px-2.5 py-1 text-[11px] text-muted-foreground">{hint}</span> : null}
      </div>
      <div className="space-y-4">{children}</div>
    </div>
  );
}

function Field({
  label,
  hint,
  meta,
  actions,
  children,
}: {
  label: string;
  hint?: string;
  meta?: React.ReactNode;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <Label>{label}</Label>
            {meta}
          </div>
          {hint ? <p className="mt-1 text-xs leading-5 text-muted-foreground">{hint}</p> : null}
        </div>
        {actions}
      </div>
      {children}
    </div>
  );
}

function ToggleField({ label, checked, onCheckedChange }: { label: string; checked: boolean; onCheckedChange: (value: boolean) => void }) {
  return (
    <div className="flex items-center justify-between rounded-2xl border border-border bg-panel/72 px-4 py-3">
      <div className="text-sm text-foreground">{label}</div>
      <Switch checked={checked} onCheckedChange={onCheckedChange} />
    </div>
  );
}

function ShardPortFields({ title, shard, onChange }: { title: string; shard: ClusterConfig['master']; onChange: (patch: Partial<ClusterConfig['master']>) => void }) {
  return (
    <div className="rounded-2xl border border-border bg-panel/72 p-4">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <div className="text-sm font-medium text-foreground">{title}</div>
          <div className="mt-1 text-xs text-muted-foreground">Shard 名称和三组 UDP 端口。</div>
        </div>
        <span className="rounded-full border border-border bg-inset px-2 py-1 font-mono text-[11px] text-muted-foreground">{shard.shardName}</span>
      </div>
      <div className="grid gap-4">
        <Field label="Shard 名称">
          <Input value={shard.shardName} onChange={(event) => onChange({ shardName: event.target.value })} placeholder={title} />
        </Field>
        <Field label="游戏端口">
          <Input type="number" value={shard.serverPort} onChange={(event) => onChange({ serverPort: Number(event.target.value) })} placeholder="10999" />
        </Field>
        <Field label="Master Server Port">
          <Input type="number" value={shard.masterServerPort} onChange={(event) => onChange({ masterServerPort: Number(event.target.value) })} placeholder="12346" />
        </Field>
        <Field label="Authentication Port">
          <Input type="number" value={shard.authenticationPort} onChange={(event) => onChange({ authenticationPort: Number(event.target.value) })} placeholder="8768" />
        </Field>
      </div>
    </div>
  );
}

function AutoSyncBadge({ mode, touched, autoLabel, manualLabel }: { mode: 'create' | 'edit'; touched: boolean; autoLabel: string; manualLabel: string }) {
  if (mode === 'edit') {
    return <span className="rounded-full border border-border bg-inset px-2 py-1 text-[11px] text-muted-foreground">稳定</span>;
  }

  return (
    <span
      className={
        touched
          ? 'rounded-full border border-border bg-inset px-2 py-1 text-[11px] text-muted-foreground'
          : 'rounded-full border border-[hsl(var(--primary)/0.2)] bg-[hsl(var(--primary)/0.1)] px-2 py-1 text-[11px] text-primary'
      }
    >
      {touched ? manualLabel : autoLabel}
    </span>
  );
}

function MetaBadge({ children, tone = 'muted' }: { children: React.ReactNode; tone?: 'muted' | 'primary' }) {
  return (
    <span
      className={
        tone === 'primary'
          ? 'rounded-full border border-[hsl(var(--primary)/0.18)] bg-[hsl(var(--primary)/0.1)] px-2 py-1 text-[11px] text-primary'
          : 'rounded-full border border-border bg-inset px-2 py-1 text-[11px] text-muted-foreground'
      }
    >
      {children}
    </span>
  );
}

function PreviewMetaRow({ label, value, copyValue }: { label: string; value: string; copyValue?: string }) {
  return (
    <div className="rounded-2xl border border-border bg-inset/60 px-4 py-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">{label}</div>
          <div className="mt-1 break-all font-mono text-[13px] text-foreground">{value}</div>
        </div>
        {copyValue ? <CopyButton value={copyValue} label="复制" /> : null}
      </div>
    </div>
  );
}

function PreviewBlock({ file, content, testId }: { file: string; content: string; testId?: string }) {
  return (
    <Card>
      <CardHeader className="border-b border-border py-4">
        <div className="flex items-center justify-between gap-3">
          <CardTitle className="font-mono text-sm">{file}</CardTitle>
          <CopyButton value={content} label="复制" />
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <pre data-testid={testId} className="max-h-64 overflow-auto bg-console px-4 py-4 text-[12px] leading-6 text-slate-200">
          {content}
        </pre>
      </CardContent>
    </Card>
  );
}

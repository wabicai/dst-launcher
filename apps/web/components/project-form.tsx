'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, ChevronUp, Layers3, ServerCog, Shield } from 'lucide-react';
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
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
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

type SaveStatus = 'idle' | 'success' | 'error';

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

  const savedBaseRef = useRef<ProjectFormValue>(initialValue);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  const [saveError, setSaveError] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showConfigFiles, setShowConfigFiles] = useState(false);
  const [autoSyncState, setAutoSyncState] = useState<AutoSyncState>({
    remotePathTouched: mode === 'edit',
  });
  const [state, setState] = useState<ProjectFormValue>(initialValue);

  const isDirty = useMemo(
    () => JSON.stringify(state) !== JSON.stringify(savedBaseRef.current),
    [state],
  );

  useEffect(() => {
    if (saveStatus !== 'success') return;
    const timer = setTimeout(() => setSaveStatus('idle'), 3000);
    return () => clearTimeout(timer);
  }, [saveStatus]);

  const preview = useMemo(() => renderConfigPreview(state.clusterConfig), [state.clusterConfig]);
  const isDockerMode = state.target.type === 'local' || state.target.type === 'ssh';
  const requiredUdpPorts = useMemo(() => {
    if (state.target.type === 'local' || state.target.type === 'ssh') {
      // Docker image uses fixed ports regardless of clusterConfig
      return [11000, 27016, 8766, 10999, 27017, 8767];
    }
    const ports = [
      state.clusterConfig.master.serverPort,
      state.clusterConfig.master.masterServerPort,
      state.clusterConfig.master.authenticationPort,
      state.clusterConfig.caves.serverPort,
      state.clusterConfig.caves.masterServerPort,
      state.clusterConfig.caves.authenticationPort,
    ];
    return Array.from(new Set(ports));
  }, [state.clusterConfig, state.target.type]);

  const completionHints = useMemo(() => {
    const issues: string[] = [];
    if (!state.clusterConfig.clusterToken.trim()) issues.push('Klei Token');
    if (state.target.type === 'ssh') {
      if (!state.target.host.trim()) issues.push('SSH 主机');
      if (!state.target.remotePath.trim()) issues.push('远程目录');
    }
    return issues;
  }, [state.clusterConfig.clusterToken, state.target]);

  function updateCluster(patch: Partial<ClusterConfig>) {
    setState((current) => ({
      ...current,
      clusterConfig: { ...current.clusterConfig, ...patch },
    }));
  }

  function updateShard(shard: 'master' | 'caves', patch: Partial<ClusterConfig['master']>) {
    setState((current) => ({
      ...current,
      clusterConfig: {
        ...current.clusterConfig,
        [shard]: { ...current.clusterConfig[shard], ...patch },
      },
    }));
  }

  function ensureSshTarget(current: TargetConfig, slug: string): SshTargetConfig {
    if (current.type === 'ssh') {
      return { ...current, remotePath: current.remotePath?.trim() || createRemoteDeployPath(slug) };
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
      target: { ...current.target, ...patch, type: current.target.type } as TargetConfig,
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
    setSaveStatus('idle');
    setSaveError('');
    try {
      await onSubmit(state);
      savedBaseRef.current = state;
      setSaveStatus('success');
    } catch (error) {
      setSaveError(error instanceof Error ? `保存失败：${error.message}` : '保存失败');
      setSaveStatus('error');
    }
  }

  async function handleTestTarget() {
    if (!onTestTarget) return;
    try {
      await onTestTarget(state.target);
      setSaveStatus('success');
      setSaveError('');
    } catch (error) {
      setSaveError(error instanceof Error ? `连接测试失败：${error.message}` : '连接测试失败');
      setSaveStatus('error');
    }
  }

  const deployTargetValue = state.target.type === 'local'
    ? `Docker Context · ${state.target.dockerContext}`
    : state.target.type === 'native'
      ? 'Mac 原生进程'
      : state.target.remotePath;

  const canSubmit = mode === 'create' || isDirty;

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
      <div className="space-y-3">
        {/* 部署目标 */}
        <FormSection icon={ServerCog} title="部署目标">
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="模式">
              <select
                data-testid="target-mode-select"
                className={selectClassName}
                value={state.target.type}
                onChange={(event) => {
                  const value = event.target.value;
                  if (value === 'local') {
                    setState((current) => ({ ...current, target: createDefaultTargetConfig() }));
                    return;
                  }
                  if (value === 'native') {
                    setState((current) => ({ ...current, target: { type: 'native' as const, steamcmdPath: '', installPath: '' } }));
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
                <option value="native">Mac 原生</option>
              </select>
            </Field>

            {state.target.type === 'local' ? (
              <Field label="Docker Context">
                <Input
                  value={state.target.dockerContext}
                  onChange={(event) => updateTarget({ dockerContext: event.target.value })}
                  placeholder="desktop-linux"
                />
              </Field>
            ) : state.target.type === 'native' ? (
              <Field label="安装路径">
                <Input
                  value={'installPath' in state.target ? state.target.installPath ?? '' : ''}
                  onChange={(event) => updateTarget({ installPath: event.target.value })}
                  placeholder="留空则自动安装到实例目录"
                />
              </Field>
            ) : (
              <Field
                label="远程目录"
                actions={
                  mode === 'create' && !autoSyncState.remotePathTouched ? (
                    <span className="rounded-full border border-[hsl(var(--primary)/0.2)] bg-[hsl(var(--primary)/0.1)] px-2 py-0.5 text-[11px] text-primary">
                      自动
                    </span>
                  ) : null
                }
              >
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

          {state.target.type === 'ssh' && (
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="主机">
                <Input
                  value={state.target.host}
                  onChange={(event) => updateTarget({ host: event.target.value })}
                  placeholder="your-vps-host"
                />
              </Field>
              <Field label="端口">
                <Input
                  type="number"
                  value={state.target.port}
                  onChange={(event) => updateTarget({ port: Number(event.target.value) })}
                  placeholder="22"
                />
              </Field>
              <Field label="用户名">
                <Input
                  value={state.target.username}
                  onChange={(event) => updateTarget({ username: event.target.value })}
                  placeholder="root"
                />
              </Field>
              <Field label="私钥路径">
                <Input
                  value={state.target.privateKeyPath}
                  onChange={(event) => updateTarget({ privateKeyPath: event.target.value })}
                  placeholder="~/.ssh/id_ed25519"
                />
              </Field>
            </div>
          )}

          <div className="flex items-center justify-between rounded-xl border border-border bg-inset/50 px-4 py-3">
            <span className="text-sm text-muted-foreground">
              {state.target.type === 'native' ? '检查 DST 服务端是否已安装' : '验证 Docker / SSH 连通性'}
            </span>
            <Button variant="secondary" size="sm" onClick={handleTestTarget} type="button">
              测试连接
            </Button>
          </div>
        </FormSection>

        {/* 房间配置 */}
        <FormSection icon={Layers3} title="房间配置">
          <Field label="服务器名称">
            <Input
              data-testid="project-name-input"
              value={state.name}
              onChange={(event) => handleNameChange(event.target.value)}
              placeholder="例如：我的饥荒服务器"
            />
          </Field>

          <Field label="项目说明">
            <Textarea
              value={state.description}
              onChange={(event) => setState((current) => ({ ...current, description: event.target.value }))}
              placeholder="备注：正式服 / 测试服 / 仅好友联机"
            />
          </Field>

          <div className="grid gap-4 md:grid-cols-3">
            <Field label="房间密码">
              <Input
                value={state.clusterConfig.clusterPassword}
                onChange={(event) => updateCluster({ clusterPassword: event.target.value })}
                placeholder="留空则公开"
              />
            </Field>
            <Field label="最大玩家数">
              <Input
                type="number"
                value={state.clusterConfig.maxPlayers}
                onChange={(event) => updateCluster({ maxPlayers: Number(event.target.value) })}
                placeholder="6"
              />
            </Field>
            <Field label="Klei Token">
              <Input
                value={state.clusterConfig.clusterToken}
                onChange={(event) => updateCluster({ clusterToken: event.target.value })}
                placeholder="DST_KLEI_TOKEN"
              />
            </Field>
          </div>

          <Field label="房间说明">
            <Textarea
              value={state.clusterConfig.clusterDescription}
              onChange={(event) => updateCluster({ clusterDescription: event.target.value })}
              placeholder="例如：生存模式、轻量模组、欢迎新手"
            />
          </Field>

          {/* 高级选项 */}
          <div className="rounded-xl border border-border bg-inset/50 px-4 py-3">
            <button
              type="button"
              className="flex w-full items-center justify-between text-sm text-muted-foreground transition hover:text-foreground"
              onClick={() => setShowAdvanced((v) => !v)}
            >
              <span>高级选项</span>
              {showAdvanced ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
            </button>
          </div>

          {showAdvanced && (
            <div className="space-y-4 rounded-xl border border-border bg-inset/35 p-4">
              <div className="grid gap-4 md:grid-cols-2">
                <Field label="游戏模式">
                  <select
                    className={selectClassName}
                    value={state.clusterConfig.gameMode}
                    onChange={(event) => updateCluster({ gameMode: event.target.value as ClusterConfig['gameMode'] })}
                  >
                    <option value="survival">survival</option>
                    <option value="endless">endless</option>
                    <option value="wilderness">wilderness</option>
                  </select>
                </Field>
                <Field label="房间倾向">
                  <select
                    className={selectClassName}
                    value={state.clusterConfig.clusterIntention}
                    onChange={(event) => updateCluster({ clusterIntention: event.target.value as ClusterConfig['clusterIntention'] })}
                  >
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

              <Field label="管理员 Klei ID">
                <Textarea
                  value={stringifyLineValues(state.clusterConfig.adminIds)}
                  onChange={(event) => updateCluster({ adminIds: parseLineValues(event.target.value) })}
                  placeholder="每行一个 Klei ID"
                />
              </Field>

              <div className="space-y-4 rounded-xl border border-border bg-panel/60 p-4">
                <div className="text-xs text-muted-foreground">原始 Workshop 输入（兼容层）</div>
                <Field label="模组合集 ID">
                  <Input
                    value={state.clusterConfig.modCollection}
                    onChange={(event) => updateCluster({ modCollection: event.target.value })}
                    placeholder="例如：3224789100"
                  />
                </Field>
                <Field label="单独模组 ID">
                  <Textarea
                    value={stringifyLineValues(state.clusterConfig.modIds)}
                    onChange={(event) => updateCluster({ modIds: parseLineValues(event.target.value) })}
                    placeholder="每行一个 mod ID"
                  />
                </Field>
              </div>
            </div>
          )}
        </FormSection>

        {/* 网络与端口 */}
        <FormSection icon={Shield} title="网络与端口">
          {isDockerMode ? (
            <div className="rounded-xl border border-primary/20 bg-primary/5 px-4 py-3 text-sm text-muted-foreground">
              <span className="font-medium text-foreground">Docker 模式使用固定端口</span>：端口由镜像内置，无法自定义。<br />
              Master：<span className="font-mono text-foreground">11000/udp</span>（游戏）、<span className="font-mono text-foreground">27016/udp</span>（Steam）、<span className="font-mono text-foreground">8766/udp</span>（认证）<br />
              Caves：<span className="font-mono text-foreground">10999/udp</span>（游戏）、<span className="font-mono text-foreground">27017/udp</span>（Steam）、<span className="font-mono text-foreground">8767/udp</span>（认证）
            </div>
          ) : (
            <div className="grid gap-4 xl:grid-cols-2">
              <ShardPortFields title="Master" shard={state.clusterConfig.master} onChange={(patch) => updateShard('master', patch)} />
              <ShardPortFields title="Caves" shard={state.clusterConfig.caves} onChange={(patch) => updateShard('caves', patch)} />
            </div>
          )}
        </FormSection>

        {/* 底部保存栏 */}
        <div className="sticky bottom-4 z-10 rounded-2xl border border-border bg-panel/96 px-4 py-3 shadow-panel backdrop-blur">
          <div className="flex items-center justify-between gap-3">
            <div className="min-h-[20px]">
              {saveStatus === 'success' ? (
                <span className="flex items-center gap-1.5 text-sm font-medium text-success">
                  <Check className="size-4" />
                  {mode === 'edit' ? '已保存' : '连接测试通过'}
                </span>
              ) : saveStatus === 'error' ? (
                <span className="text-sm text-danger">{saveError}</span>
              ) : completionHints.length > 0 ? (
                <span className="text-xs text-muted-foreground">待填写：{completionHints.join('、')}</span>
              ) : null}
            </div>
            <Button
              data-testid="project-submit-button"
              size="lg"
              variant={canSubmit ? 'primary' : 'secondary'}
              onClick={handleSubmit}
              disabled={busy || !canSubmit}
            >
              {busy ? '处理中...' : mode === 'create' ? '创建并进入工作区' : '保存'}
            </Button>
          </div>
        </div>
      </div>

      {/* 右侧预览 */}
      <div data-testid="project-form-preview" className="space-y-3 xl:sticky xl:top-20 xl:self-start">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">配置概览</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <PreviewMetaRow label="Slug" value={state.slug || DEFAULT_PROJECT_SLUG} copyValue={state.slug || DEFAULT_PROJECT_SLUG} />
            <PreviewMetaRow label="部署目标" value={deployTargetValue} copyValue={deployTargetValue} />
            <div className="rounded-xl border border-border bg-inset/60 px-4 py-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-xs text-muted-foreground">UDP 端口</div>
                  <div className="mt-1 text-sm text-foreground">{requiredUdpPorts.length} 个</div>
                </div>
                <CopyButton value={requiredUdpPorts.join(', ')} label="复制" />
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {requiredUdpPorts.map((port) => (
                  <span key={port} className="rounded-full border border-border bg-panel px-2.5 py-0.5 font-mono text-[11px] text-foreground">
                    {port}
                  </span>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* 配置文件（可折叠） */}
        <div className="space-y-2">
          <button
            type="button"
            onClick={() => setShowConfigFiles((v) => !v)}
            className="flex w-full items-center justify-between rounded-xl border border-border bg-panel/60 px-4 py-2.5 text-sm text-muted-foreground transition hover:text-foreground"
          >
            <span>配置文件预览</span>
            {showConfigFiles ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
          </button>

          {showConfigFiles &&
            Object.entries(preview).map(([file, content]) => (
              <PreviewBlock key={file} file={file} content={content} testId={file === 'cluster.ini' ? 'preview-cluster-ini' : undefined} />
            ))}
        </div>
      </div>
    </div>
  );
}

function FormSection({
  icon: Icon,
  title,
  children,
}: {
  icon: typeof ServerCog;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2.5">
          <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-lg border border-border bg-inset text-primary">
            <Icon className="size-3.5" />
          </span>
          <CardTitle className="text-base">{title}</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">{children}</CardContent>
    </Card>
  );
}

function Field({
  label,
  actions,
  children,
}: {
  label: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <Label className="text-xs text-muted-foreground">{label}</Label>
        {actions}
      </div>
      {children}
    </div>
  );
}

function ToggleField({ label, checked, onCheckedChange }: { label: string; checked: boolean; onCheckedChange: (value: boolean) => void }) {
  return (
    <div className="flex items-center justify-between rounded-xl border border-border bg-panel/72 px-3 py-2.5">
      <div className="text-sm text-foreground">{label}</div>
      <Switch checked={checked} onCheckedChange={onCheckedChange} />
    </div>
  );
}

function ShardPortFields({ title, shard, onChange }: { title: string; shard: ClusterConfig['master']; onChange: (patch: Partial<ClusterConfig['master']>) => void }) {
  return (
    <div className="rounded-xl border border-border bg-panel/72 p-4">
      <div className="mb-3 text-sm font-medium text-foreground">{title}</div>
      <div className="space-y-3">
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

function PreviewMetaRow({ label, value, copyValue }: { label: string; value: string; copyValue?: string }) {
  return (
    <div className="rounded-xl border border-border bg-inset/60 px-3 py-2.5">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[11px] text-muted-foreground">{label}</div>
          <div className="mt-0.5 truncate font-mono text-[12px] text-foreground">{value}</div>
        </div>
        {copyValue ? <CopyButton value={copyValue} label="复制" /> : null}
      </div>
    </div>
  );
}

function PreviewBlock({ file, content, testId }: { file: string; content: string; testId?: string }) {
  return (
    <div className="overflow-hidden rounded-xl border border-border">
      <div className="flex items-center justify-between border-b border-border bg-panel/60 px-3 py-2">
        <span className="font-mono text-[11px] text-muted-foreground">{file}</span>
        <CopyButton value={content} label="复制" />
      </div>
      <pre data-testid={testId} className="max-h-48 overflow-auto bg-console px-4 py-3 text-[11px] leading-5 text-slate-200">
        {content}
      </pre>
    </div>
  );
}

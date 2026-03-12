'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ProjectForm, type ProjectFormValue } from '@/components/project-form';
import { getApiClient } from '@/lib/api';
import type { TargetConfig } from '@dst-launcher/shared';

export default function NewProjectPage() {
  const router = useRouter();
  const client = useMemo(() => getApiClient(), []);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  async function handleCreate(input: ProjectFormValue) {
    setBusy(true);
    setMessage('');
    try {
      const detail = await client.createProject({
        name: input.name,
        slug: input.slug,
        description: input.description,
        target: input.target,
        clusterConfig: input.clusterConfig,
      });
      router.push(`/project?id=${detail.id}`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '创建失败');
    } finally {
      setBusy(false);
    }
  }

  async function handleTestTarget(target: TargetConfig) {
    const result = await client.testTarget({ target });
    if (!result.ok) {
      throw new Error(result.detail || result.message);
    }
    setMessage(result.detail || result.message);
  }

  return (
    <main className="space-y-6">
      <div>
        <a href="/" className="text-sm text-muted-foreground transition hover:text-foreground">← 返回项目列表</a>
        <h1 className="mt-3 font-display text-4xl">新建项目</h1>
        <p className="mt-2 text-sm text-muted-foreground">第一版默认按个人开发效率优先，尽量少做决策、多做结构化收口。</p>
      </div>
      {message ? <div className="rounded-2xl border border-border bg-muted/50 px-4 py-3 text-sm text-muted-foreground">{message}</div> : null}
      <ProjectForm mode="create" onSubmit={handleCreate} onTestTarget={handleTestTarget} busy={busy} />
    </main>
  );
}

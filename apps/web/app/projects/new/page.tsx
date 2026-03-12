'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
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
      setMessage(error instanceof Error ? `创建失败：${error.message}` : '创建失败。');
    } finally {
      setBusy(false);
    }
  }

  async function handleTestTarget(target: TargetConfig) {
    const result = await client.testTarget({ target });
    if (!result.ok) {
      throw new Error(result.detail || result.message);
    }
    setMessage(result.detail || '连接测试通过。');
  }

  return (
    <main className="space-y-4">
      <div className="flex flex-col gap-2">
        <Link href="/" className="inline-flex items-center gap-2 text-sm text-muted-foreground transition hover:text-foreground">
          <ArrowLeft className="size-4" />
          返回项目列表
        </Link>
        <p className="text-sm text-muted-foreground">单页配置，右侧实时预览。</p>
      </div>
      {message ? <div className="rounded-2xl border border-border bg-panel/88 px-4 py-3 text-sm text-muted-foreground">{message}</div> : null}
      <ProjectForm mode="create" onSubmit={handleCreate} onTestTarget={handleTestTarget} busy={busy} />
    </main>
  );
}

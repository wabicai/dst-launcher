'use client';

import { useSearchParams } from 'next/navigation';
import { ProjectWorkspace } from '@/components/project-workspace';

export function ProjectWorkspacePage() {
  const searchParams = useSearchParams();
  const projectId = searchParams.get('id');

  if (!projectId) {
    return <div className="rounded-3xl border border-danger/30 bg-danger/10 p-8 text-sm text-danger">缺少项目 ID，请从项目列表重新进入。</div>;
  }

  return <ProjectWorkspace projectId={projectId} />;
}

import { Suspense } from 'react';
import { ProjectWorkspacePage } from './workspace-page';

export default function ProjectPage() {
  return (
    <Suspense fallback={<div className="rounded-3xl border border-border bg-card/60 p-8 text-sm text-muted-foreground">项目工作区加载中...</div>}>
      <ProjectWorkspacePage />
    </Suspense>
  );
}

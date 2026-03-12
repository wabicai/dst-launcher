'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { FolderKanban, MonitorSmartphone, PlusSquare, ServerCog } from 'lucide-react';
import { cn } from '@/lib/utils';

const navItems = [
  {
    href: '/',
    label: '项目',
    icon: FolderKanban,
  },
  {
    href: '/projects/new',
    label: '新建',
    icon: PlusSquare,
  },
] as const;

const shellCopy = {
  '/': {
    title: '项目',
    detail: '直接进入工作。',
  },
  '/projects/new': {
    title: '新建项目',
    detail: '配置、预览、创建。',
  },
  '/project': {
    title: '工作区',
    detail: '部署、日志、网络。',
  },
} as const;

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [runtimeLabel, setRuntimeLabel] = useState('Browser');

  useEffect(() => {
    if (typeof window !== 'undefined' && window.dstLauncher?.apiBaseUrl) {
      setRuntimeLabel('Desktop');
      return;
    }

    setRuntimeLabel('Browser');
  }, []);

  const shellMeta = useMemo<{ title: string; detail: string }>(() => {
    if (pathname === '/' || pathname === '/projects/new' || pathname === '/project') {
      return shellCopy[pathname];
    }

    return shellCopy['/project'];
  }, [pathname]);

  return (
    <div className="mx-auto min-h-screen max-w-[1640px] p-3 lg:p-4">
      <div className="flex min-h-[calc(100vh-1.5rem)] flex-col gap-3 lg:grid lg:grid-cols-[76px_minmax(0,1fr)]">
        <aside className="hidden lg:flex lg:flex-col">
          <div className="sticky top-4 flex h-[calc(100vh-2rem)] flex-col items-center rounded-[22px] border border-border/80 bg-panel/92 px-2 py-3 shadow-panel backdrop-blur">
            <Link href="/" aria-label="DST Launcher" className="flex w-full flex-col items-center gap-2 rounded-[18px] border border-border/80 bg-inset/55 px-2 py-3 transition-colors hover:border-[hsl(var(--primary)/0.18)] hover:bg-inset/80">
              <span className="inline-flex size-10 items-center justify-center rounded-[14px] border border-[hsl(var(--primary)/0.22)] bg-[hsl(var(--primary)/0.1)] text-primary">
                <ServerCog className="size-4" />
              </span>
              <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.22em] text-foreground">DST</span>
            </Link>

            <nav className="mt-4 flex w-full flex-col items-center gap-2">
              {navItems.map((item) => {
                const Icon = item.icon;
                const active = pathname === item.href;

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    aria-label={item.label}
                    title={item.label}
                    className={cn(
                      'group relative flex size-11 items-center justify-center rounded-[14px] border transition-all duration-200',
                      active
                        ? 'border-[hsl(var(--primary)/0.24)] bg-[hsl(var(--primary)/0.1)] text-primary shadow-[0_10px_24px_rgba(214,167,103,0.08)]'
                        : 'border-transparent bg-transparent text-muted-foreground hover:border-border hover:bg-inset/80 hover:text-foreground',
                    )}
                  >
                    {active ? <span className="absolute -left-[10px] h-5 w-[2px] rounded-full bg-primary/80" /> : null}
                    <Icon className="size-[18px]" />
                    <span className="sr-only">{item.label}</span>
                  </Link>
                );
              })}
            </nav>

            <div className="mt-auto flex flex-col items-center gap-2">
              <span className="inline-flex size-10 items-center justify-center rounded-[14px] border border-border bg-inset/60 text-primary">
                <MonitorSmartphone className="size-4" />
              </span>
              <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">{runtimeLabel === 'Desktop' ? 'DESK' : 'WEB'}</span>
            </div>
          </div>
        </aside>

        <div className="flex min-h-0 flex-1 flex-col rounded-[18px] border border-border bg-page/86 shadow-panel backdrop-blur">
          <header className="sticky top-3 z-20 border-b border-border bg-page/92 px-4 py-3 backdrop-blur lg:px-5">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex items-center gap-3">
                <div className="text-sm font-semibold text-foreground">{shellMeta.title}</div>
                <span className="rounded-full border border-border bg-inset px-3 py-1 font-mono text-[11px] text-muted-foreground">{runtimeLabel}</span>
                <span className="hidden text-sm text-muted-foreground md:inline">{shellMeta.detail}</span>
              </div>

              <div className="flex gap-2 lg:hidden">
                {navItems.map((item) => {
                  const active = pathname === item.href;
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={cn(
                        'rounded-lg border px-3 py-2 text-sm transition-colors',
                        active ? 'border-[hsl(var(--primary)/0.25)] bg-[hsl(var(--primary)/0.1)] text-foreground' : 'border-border bg-inset text-muted-foreground',
                      )}
                    >
                      {item.label}
                    </Link>
                  );
                })}
              </div>
            </div>
          </header>

          <main className="flex-1 overflow-x-hidden px-4 py-4 lg:px-5 lg:py-5">{children}</main>
        </div>
      </div>
    </div>
  );
}

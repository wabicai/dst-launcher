import type { Metadata } from 'next';
import { IBM_Plex_Mono, IBM_Plex_Sans } from 'next/font/google';
import { Toaster } from 'sonner';
import { AppShell } from '@/components/app-shell';
import './globals.css';

const bodyFont = IBM_Plex_Sans({
  subsets: ['latin'],
  variable: '--font-body',
  weight: ['400', '500', '600'],
});

const monoFont = IBM_Plex_Mono({
  subsets: ['latin'],
  variable: '--font-mono',
  weight: ['400', '500', '600'],
});

export const metadata: Metadata = {
  title: 'DST Launcher',
  description: '面向个人开发者的饥荒联机版桌面启动器',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN" className={`${bodyFont.variable} ${monoFont.variable}`}>
      <body>
        <AppShell>{children}</AppShell>
        <Toaster
          position="bottom-right"
          toastOptions={{
            className: '!rounded-xl !border !border-border !bg-panel !text-foreground !shadow-panel',
            descriptionClassName: '!text-muted-foreground',
          }}
        />
      </body>
    </html>
  );
}

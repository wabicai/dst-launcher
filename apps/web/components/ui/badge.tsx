import { cn } from '@/lib/utils';

const variantMap = {
  idle: {
    label: '空闲',
    wrapper: 'border-border bg-inset text-muted-foreground',
    dot: 'bg-muted-foreground',
  },
  running: {
    label: '运行中',
    wrapper: 'border-success/25 bg-success/10 text-success',
    dot: 'bg-success',
  },
  stopped: {
    label: '已停止',
    wrapper: 'border-warning/25 bg-warning/10 text-warning',
    dot: 'bg-warning',
  },
  error: {
    label: '异常',
    wrapper: 'border-danger/25 bg-danger/10 text-danger',
    dot: 'bg-danger',
  },
  unknown: {
    label: '未知',
    wrapper: 'border-border bg-inset text-muted-foreground',
    dot: 'bg-muted-foreground',
  },
};

export function Badge({ value, label }: { value: keyof typeof variantMap; label?: string }) {
  const item = variantMap[value];

  return (
    <span
      data-status={value}
      className={cn('inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[11px] font-medium tracking-[0.14em]', item.wrapper)}
    >
      <span className={cn('size-1.5 rounded-full', item.dot)} />
      <span>{label ?? item.label}</span>
    </span>
  );
}

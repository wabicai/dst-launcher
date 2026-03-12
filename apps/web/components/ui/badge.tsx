import { cn } from '@/lib/utils';

const variantMap = {
  idle: 'border-border bg-card text-muted-foreground',
  running: 'border-success/40 bg-success/10 text-success',
  stopped: 'border-warning/40 bg-warning/10 text-warning',
  error: 'border-danger/40 bg-danger/10 text-danger',
  unknown: 'border-border bg-card text-muted-foreground',
};

export function Badge({ value }: { value: keyof typeof variantMap }) {
  return (
    <span className={cn('inline-flex rounded-full border px-3 py-1 text-xs font-medium uppercase tracking-[0.18em]', variantMap[value])}>
      {value}
    </span>
  );
}

import * as React from 'react';
import { cn } from '@/lib/utils';

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(({ className, ...props }, ref) => (
  <input
    ref={ref}
    className={cn(
      'h-10 w-full rounded-xl border border-border bg-inset px-3 text-sm text-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.02)] outline-none transition-all placeholder:text-muted-foreground/70 hover:border-[hsl(var(--primary)/0.18)] focus:border-[hsl(var(--primary)/0.48)] focus:bg-panel focus:ring-4 focus:ring-[hsl(var(--primary)/0.1)]',
      className,
    )}
    {...props}
  />
));
Input.displayName = 'Input';

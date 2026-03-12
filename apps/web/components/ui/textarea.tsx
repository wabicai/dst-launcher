import * as React from 'react';
import { cn } from '@/lib/utils';

export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, ...props }, ref) => (
    <textarea
      ref={ref}
      className={cn(
        'min-h-24 w-full rounded-xl border border-border bg-card/80 px-3 py-2 text-sm text-foreground outline-none transition placeholder:text-muted-foreground focus:border-primary',
        className,
      )}
      {...props}
    />
  ),
);
Textarea.displayName = 'Textarea';

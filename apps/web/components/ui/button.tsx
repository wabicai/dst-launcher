import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const buttonVariants = cva(
  'inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-xl border text-sm font-medium transition-all duration-200 focus-visible:ring-4 focus-visible:ring-[hsl(var(--primary)/0.14)] disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        primary: 'border-[hsl(var(--primary)/0.28)] bg-primary text-primary-foreground shadow-[0_8px_24px_rgba(214,167,103,0.14)] hover:-translate-y-[1px] hover:brightness-105',
        secondary: 'border-border bg-inset text-foreground hover:border-[hsl(var(--primary)/0.18)] hover:bg-panel',
        ghost: 'border-transparent bg-transparent text-muted-foreground hover:bg-inset hover:text-foreground',
        danger: 'border-[hsl(var(--danger)/0.28)] bg-danger/90 text-white hover:brightness-105',
      },
      size: {
        sm: 'h-8 px-3 text-xs',
        md: 'h-10 px-4',
        lg: 'h-11 px-5',
      },
    },
    defaultVariants: {
      variant: 'primary',
      size: 'md',
    },
  },
);

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(({ className, variant, size, ...props }, ref) => {
  return <button ref={ref} className={cn(buttonVariants({ variant, size }), className)} {...props} />;
});
Button.displayName = 'Button';

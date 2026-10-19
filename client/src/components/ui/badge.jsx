import { cva } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 [&_svg]:size-3',
  {
    variants: {
      variant: {
        default: 'border-transparent bg-primary text-primary-foreground shadow hover:bg-primary/80',
        secondary: 'border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/80',
        destructive: 'border-transparent bg-destructive text-destructive-foreground shadow hover:bg-destructive/80',
        outline: 'text-foreground',
        // App-specific status tones; always paired with a text label, never colour alone.
        good: 'border-transparent bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
        warning: 'border-transparent bg-amber-50 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
        critical: 'border-transparent bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-300',
        info: 'border-transparent bg-brand-50 text-brand-700 dark:bg-brand-900/40 dark:text-brand-200',
      },
    },
    defaultVariants: { variant: 'default' },
  }
);

function Badge({ className, variant, ...props }) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };

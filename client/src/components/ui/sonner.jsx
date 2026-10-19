import { Toaster as Sonner } from 'sonner';
import { useApp } from '@/context';

const Toaster = ({ ...props }) => {
  const { dark } = useApp();
  return (
    <Sonner
      theme={dark ? 'dark' : 'light'}
      className="toaster group"
      position="bottom-center"
      offset={88}
      toastOptions={{
        classNames: {
          toast: 'group toast group-[.toaster]:bg-background group-[.toaster]:text-foreground group-[.toaster]:border-border group-[.toaster]:shadow-lg',
          description: 'group-[.toast]:text-muted-foreground',
          actionButton: 'group-[.toast]:bg-primary group-[.toast]:text-primary-foreground',
          cancelButton: 'group-[.toast]:bg-muted group-[.toast]:text-muted-foreground',
        },
      }}
      {...props}
    />
  );
};

export { Toaster };

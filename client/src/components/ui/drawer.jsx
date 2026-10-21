import * as React from 'react';
import { Drawer as DrawerPrimitive } from 'vaul';
import { cn } from '@/lib/utils';

// shadcn/ui Drawer (vaul), extended so the same drawer can open from the bottom (phones)
// or slide in from the right (larger screens).
const Drawer = ({ shouldScaleBackground = false, ...props }) => <DrawerPrimitive.Root shouldScaleBackground={shouldScaleBackground} {...props} />;
Drawer.displayName = 'Drawer';

const DrawerTrigger = DrawerPrimitive.Trigger;
const DrawerPortal = DrawerPrimitive.Portal;
const DrawerClose = DrawerPrimitive.Close;

const DrawerOverlay = React.forwardRef(({ className, ...props }, ref) => (
  <DrawerPrimitive.Overlay ref={ref} className={cn('fixed inset-0 z-50 bg-black/60', className)} {...props} />
));
DrawerOverlay.displayName = DrawerPrimitive.Overlay.displayName;

const DrawerContent = React.forwardRef(({ className, children, direction = 'bottom', ...props }, ref) => (
  <DrawerPortal>
    <DrawerOverlay />
    <DrawerPrimitive.Content
      ref={ref}
      className={cn(
        'fixed z-50 flex flex-col border bg-background outline-none',
        direction === 'bottom' && 'inset-x-0 bottom-0 mt-24 max-h-[94dvh] rounded-t-2xl',
        direction === 'right' && 'inset-y-0 right-0 h-full w-full max-w-[460px] rounded-l-2xl',
        className
      )}
      {...props}
    >
      {direction === 'bottom' && <DrawerPrimitive.Handle className="!mt-3 !h-1.5 !w-12 shrink-0 !bg-muted" />}
      {children}
    </DrawerPrimitive.Content>
  </DrawerPortal>
));
DrawerContent.displayName = 'DrawerContent';

const DrawerHeader = ({ className, ...props }) => <div className={cn('grid gap-1.5 p-4 text-left', className)} {...props} />;
DrawerHeader.displayName = 'DrawerHeader';

const DrawerFooter = ({ className, ...props }) => <div className={cn('mt-auto flex flex-col gap-2 p-4', className)} {...props} />;
DrawerFooter.displayName = 'DrawerFooter';

const DrawerTitle = React.forwardRef(({ className, ...props }, ref) => (
  <DrawerPrimitive.Title ref={ref} className={cn('text-lg font-semibold leading-none tracking-tight', className)} {...props} />
));
DrawerTitle.displayName = DrawerPrimitive.Title.displayName;

const DrawerDescription = React.forwardRef(({ className, ...props }, ref) => (
  <DrawerPrimitive.Description ref={ref} className={cn('text-sm text-muted-foreground', className)} {...props} />
));
DrawerDescription.displayName = DrawerPrimitive.Description.displayName;

export { Drawer, DrawerPortal, DrawerOverlay, DrawerTrigger, DrawerClose, DrawerContent, DrawerHeader, DrawerFooter, DrawerTitle, DrawerDescription };

import * as React from 'react';

import { cn } from '../../lib/utils';

interface CollapsibleProps {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  children: React.ReactNode;
  className?: string;
}

interface CollapsibleTriggerProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  icon?: React.ReactNode;
  children: React.ReactNode;
}

interface CollapsibleContentProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
}

// Default no-op function for uncontrolled component default value
const noop = (): void => {
  return;
};

const CollapsibleContext = React.createContext<{
  open: boolean;
  onOpenChange: (open: boolean) => void;
}>({
  open: false,
  onOpenChange: noop,
});

function Collapsible({
  open: controlledOpen,
  onOpenChange: controlledOnOpenChange,
  children,
  className,
}: CollapsibleProps): React.JSX.Element {
  const [uncontrolledOpen, setUncontrolledOpen] = React.useState(false);
  const isControlled = controlledOpen !== undefined;
  const open = isControlled ? controlledOpen : uncontrolledOpen;
  const onOpenChange = isControlled ? (controlledOnOpenChange ?? noop) : setUncontrolledOpen;

  return (
    <CollapsibleContext.Provider value={{ open, onOpenChange }}>
      {/* Remove border-b, use spacing instead for modern look */}
      <div className={cn('', className)}>{children}</div>
    </CollapsibleContext.Provider>
  );
}

function CollapsibleTrigger({
  icon,
  children,
  className,
  ...props
}: CollapsibleTriggerProps): React.JSX.Element {
  const { open, onOpenChange } = React.useContext(CollapsibleContext);

  return (
    <div className="px-3 pt-4 pb-2">
      <button
        type="button"
        onClick={(): void => {
          onOpenChange(!open);
        }}
        className={cn(
          'flex w-full items-center gap-3 rounded-lg px-2 py-2.5',
          'text-base font-medium text-foreground',
          'transition-all duration-200 ease-out',
          'hover:bg-muted/60',
          'active:scale-[0.98]',
          className
        )}
        {...props}
      >
        {/* Icon container with subtle styling */}
        {icon !== undefined && (
          <div
            className={cn(
              'flex h-7 w-7 items-center justify-center rounded-lg',
              'bg-muted/50 text-muted-foreground',
              'transition-colors duration-200',
              open && 'bg-primary/10 text-primary'
            )}
          >
            {icon}
          </div>
        )}
        <span className="flex-1 text-left">{children}</span>
        {/* Subtle indicator instead of chevron */}
        <div
          className={cn(
            'h-1.5 w-1.5 rounded-full',
            'transition-all duration-200',
            open ? 'bg-primary' : 'bg-muted-foreground/30'
          )}
        />
      </button>
    </div>
  );
}

function CollapsibleContent({
  children,
  className,
  ...props
}: CollapsibleContentProps): React.JSX.Element {
  const { open } = React.useContext(CollapsibleContext);
  const contentRef = React.useRef<HTMLDivElement>(null);
  const [height, setHeight] = React.useState<number | undefined>(undefined);
  const [isAnimating, setIsAnimating] = React.useState(false);

  React.useEffect(() => {
    if (contentRef.current !== null) {
      setHeight(contentRef.current.scrollHeight);
    }
  }, [children]);

  // Track animation state to control overflow
  React.useEffect(() => {
    setIsAnimating(true);
    const timer = setTimeout(() => {
      setIsAnimating(false);
    }, 200); // Match transition duration
    return (): void => {
      clearTimeout(timer);
    };
  }, [open]);

  return (
    <div
      style={{
        height: open ? height : 0,
        opacity: open ? 1 : 0,
        // Only hide overflow during animation, allow visible when open and settled
        overflow: !open || isAnimating ? 'hidden' : 'visible',
        transition: 'height 200ms ease-out, opacity 150ms ease-out',
      }}
    >
      <div ref={contentRef} className={cn('px-5 pb-5', className)} {...props}>
        {children}
      </div>
    </div>
  );
}

export { Collapsible, CollapsibleTrigger, CollapsibleContent };

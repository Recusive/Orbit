import { createLogger } from '@orbit/common/lib';
import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';

import type { AppIconInfo } from '@/lib/api/icons';
import type { FC } from 'react';

import { listAppIcons, setAppIcon } from '@/lib/api/icons';
import { cn } from '@/lib/utils';

const logger = createLogger('AppIconPicker');

/* ── Layout ───────────────────────────────────────────────── */

const ICON_PX = 48;
const ICON_RADIUS = 11;

/* ── Animation ────────────────────────────────────────────── */

const EASE = 'cubic-bezier(0.23, 1, 0.32, 1)';
const REDUCED_MOTION = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const STAGGER = 50;

function tr(props: string[], ms: number, delay = 0): string {
  if (REDUCED_MOTION) return 'none';
  const d = delay > 0 ? ` ${String(delay)}ms` : '';
  return props.map((p) => `${p} ${String(ms)}ms ${EASE}${d}`).join(', ');
}

/* ── Shelf ────────────────────────────────────────────────── */

const SHELF_STYLE: React.CSSProperties = {
  background: 'var(--orbit-background-100)',
  border: '1px solid var(--orbit-alpha-100)',
  boxShadow: 'inset 0 0.5px 0 rgba(255, 255, 255, 0.08), 0 4px 12px -2px rgba(0, 0, 0, 0.15)',
};

/* ── Icon transition (applied to <img> via inline style) ── */

const ICON_TRANSITION = REDUCED_MOTION ? 'none' : 'transform 200ms ease';

/* ── DockIcon ─────────────────────────────────────────────── */

/** Ref-based hover magnification — bypasses Tailwind's `scale` property
    (which isn't covered by `transition-transform` in Tailwind v4) and
    uses the `transform` property directly for guaranteed smooth animation.
    No React state for interactions — refs mutate the DOM outside render. */
const DockIcon: FC<{
  readonly icon: AppIconInfo;
  readonly isActive: boolean;
  readonly index: number;
  readonly isReady: boolean;
  readonly onSelect: (id: string) => void;
}> = ({ icon, isActive, index, isReady, onSelect }) => {
  const imgRef = useRef<HTMLImageElement>(null);

  return (
    <button
      type="button"
      aria-label={`Set app icon to ${icon.name}`}
      aria-pressed={isActive}
      className="group relative overflow-visible outline-none"
      style={{
        width: ICON_PX,
        height: ICON_PX,
        flexShrink: 0,
        opacity: isReady ? 1 : 0,
        transition: tr(['opacity'], 400, index * STAGGER),
      }}
      onClick={() => {
        onSelect(icon.id);
      }}
      onPointerEnter={() => {
        if (imgRef.current !== null && !REDUCED_MOTION) {
          imgRef.current.style.transform = 'scale(1.15)';
        }
      }}
      onPointerLeave={() => {
        if (imgRef.current !== null && !REDUCED_MOTION) {
          imgRef.current.style.transform = 'scale(1)';
        }
      }}
    >
      {/* Invisible hover extension — keeps tooltip alive as cursor moves up */}
      <div className="absolute inset-x-0 -top-8 h-8" />

      {/* Tooltip */}
      <div
        className={cn(
          'pointer-events-none absolute left-1/2 -translate-x-1/2 whitespace-nowrap',
          'rounded-md border border-border/40 bg-popover px-2 py-0.5',
          'text-[10px] font-medium text-popover-foreground shadow-sm',
          'opacity-0 transition-opacity duration-150 motion-reduce:transition-none',
          'group-hover:opacity-100'
        )}
        style={{ bottom: ICON_PX + 12 }}
      >
        {icon.name}
      </div>

      {/* Icon image — ref-driven hover magnification from bottom edge */}
      <img
        ref={imgRef}
        src={icon.previewUrl}
        alt={icon.name}
        draggable={false}
        className="object-contain"
        style={{
          width: ICON_PX,
          height: ICON_PX,
          borderRadius: ICON_RADIUS,
          transformOrigin: 'center bottom',
          transition: ICON_TRANSITION,
        }}
      />
    </button>
  );
};

/* ── Skeleton ─────────────────────────────────────────────── */

const SKELETON_COUNT = 4;

const DockSkeleton: FC = () => (
  <div className="flex flex-col items-center">
    <div className="flex items-end gap-1 rounded-[16px] p-2" style={SHELF_STYLE}>
      {Array.from({ length: SKELETON_COUNT }, (_, i) => (
        <div
          key={i}
          className="animate-pulse rounded-[11px] bg-foreground/5"
          style={{ width: ICON_PX, height: ICON_PX }}
        />
      ))}
    </div>
    <div className="h-5" />
  </div>
);

/* ── AppIconPicker ────────────────────────────────────────── */

export const AppIconPicker: FC = () => {
  const [icons, setIcons] = useState<AppIconInfo[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isReady, setIsReady] = useState(false);
  const confirmedRef = useRef<string | null>(null);
  const inFlightRef = useRef(false);
  const pendingRef = useRef<string | null>(null);

  useEffect(() => {
    void listAppIcons()
      .then((result) => {
        setIcons(result);
        const active = result.find((i) => i.isActive);
        if (active !== undefined) {
          setActiveId(active.id);
          confirmedRef.current = active.id;
        }
      })
      .catch((error: unknown) => {
        logger.error('Failed to load app icons', error);
      })
      .finally(() => {
        setIsLoading(false);
        requestAnimationFrame(() => {
          setIsReady(true);
        });
      });
  }, []);

  const processSwitch = useCallback(async (id: string): Promise<void> => {
    inFlightRef.current = true;
    setActiveId(id);

    try {
      await setAppIcon(id);
      confirmedRef.current = id;
    } catch (error: unknown) {
      logger.error('Failed to switch app icon', error);
      toast.error('Failed to switch app icon');
      setActiveId(confirmedRef.current);
    } finally {
      inFlightRef.current = false;

      const next = pendingRef.current;
      pendingRef.current = null;
      if (next !== null && next !== confirmedRef.current) {
        void processSwitch(next);
      }
    }
  }, []);

  const handleSelect = useCallback(
    (id: string): void => {
      if (id === activeId) return;

      if (inFlightRef.current) {
        pendingRef.current = id;
        setActiveId(id);
        return;
      }

      void processSwitch(id);
    },
    [activeId, processSwitch]
  );

  if (isLoading) return <DockSkeleton />;
  if (icons.length === 0) return null;

  return (
    <div className="flex flex-col items-center">
      {/* The Dock shelf */}
      <div className="overflow-visible rounded-[16px] px-2 pt-2 pb-1.5" style={SHELF_STYLE}>
        <div className="flex items-end gap-1 overflow-visible">
          {icons.map((icon, i) => (
            <DockIcon
              key={icon.id}
              icon={icon}
              isActive={icon.id === activeId}
              index={i}
              isReady={isReady}
              onSelect={handleSelect}
            />
          ))}
        </div>

        {/* Active indicator dots */}
        <div className="flex items-center gap-1 pt-1.5">
          {icons.map((icon) => (
            <div key={icon.id} className="flex justify-center" style={{ width: ICON_PX }}>
              <div
                className="rounded-full bg-foreground/70"
                style={{
                  width: 4,
                  height: 4,
                  opacity: icon.id === activeId ? 1 : 0,
                  transform: icon.id === activeId ? 'scale(1)' : 'scale(0)',
                  transition: tr(['opacity', 'transform'], 200),
                }}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

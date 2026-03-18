import * as DialogPrimitive from '@radix-ui/react-dialog';
import { ChevronLeft, ChevronRight, ImageOff, X } from 'lucide-react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { memo, useCallback, useEffect, useMemo, useState } from 'react';

import type { ImageAttachment } from '../input';
import type { Transition } from 'motion/react';
import type { FC } from 'react';

import { SafeImage } from '@/components/shared';
import {
  Dialog,
  DialogClose,
  DialogDescription,
  DialogPortal,
  DialogTitle,
} from '@/components/ui/dialog';
import { onOverlayMount, onOverlayUnmount } from '@/lib/browser-overlay-coordination';

/* ── Lightbox animation constants ──────────────────────────────────────────── */

/** Smooth modal easing — cubic-bezier(0.16, 1, 0.3, 1) */
const EASE_SMOOTH: [number, number, number, number] = [0.16, 1, 0.3, 1];

/** Entrance: 250ms scale + fade with smooth deceleration. */
const LIGHTBOX_ENTER: Transition = {
  opacity: { duration: 0.25, ease: EASE_SMOOTH },
  scale: { duration: 0.25, ease: EASE_SMOOTH },
};

/** Exit: 20% faster than enter so dismissal feels snappy. */
const LIGHTBOX_EXIT: Transition = {
  opacity: { duration: 0.2, ease: EASE_SMOOTH },
  scale: { duration: 0.2, ease: EASE_SMOOTH },
};

/** Instant transition for prefers-reduced-motion. */
const LIGHTBOX_TRANSITION_NONE: Transition = { duration: 0 };

/* ── Component ─────────────────────────────────────────────────────────────── */

interface ImageLightboxProps {
  readonly attachedImages: readonly ImageAttachment[];
  readonly currentIndex: number;
  readonly onIndexChange: (index: number) => void;
  readonly onOpenChange: (open: boolean) => void;
  readonly open: boolean;
}

function normalizeIndex(index: number, length: number): number {
  if (length === 0) {
    return 0;
  }

  return ((index % length) + length) % length;
}

export const ImageLightbox: FC<ImageLightboxProps> = memo(function ImageLightbox({
  attachedImages,
  currentIndex,
  onIndexChange,
  onOpenChange,
  open,
}) {
  const [brokenPreviewUrls, setBrokenPreviewUrls] = useState<Record<string, true>>({});
  const shouldReduceMotion = useReducedMotion();
  const imageCount = attachedImages.length;
  const safeIndex = useMemo(
    () => normalizeIndex(currentIndex, imageCount),
    [currentIndex, imageCount]
  );
  const activeImage = attachedImages[safeIndex];

  const selectPrevious = useCallback(() => {
    if (imageCount <= 1) {
      return;
    }

    onIndexChange(normalizeIndex(safeIndex - 1, imageCount));
  }, [imageCount, onIndexChange, safeIndex]);

  const selectNext = useCallback(() => {
    if (imageCount <= 1) {
      return;
    }

    onIndexChange(normalizeIndex(safeIndex + 1, imageCount));
  }, [imageCount, onIndexChange, safeIndex]);

  // Keyboard navigation
  useEffect(() => {
    if (!open) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        selectPrevious();
      } else if (event.key === 'ArrowRight') {
        event.preventDefault();
        selectNext();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return (): void => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [open, selectNext, selectPrevious]);

  // Browser overlay coordination (hides native browser window while lightbox is open)
  useEffect(() => {
    if (!open) {
      return;
    }

    onOverlayMount();
    return (): void => {
      onOverlayUnmount();
    };
  }, [open]);

  if (!activeImage) {
    return null;
  }

  const isBroken = brokenPreviewUrls[activeImage.previewUrl] === true;
  const enterTransition = shouldReduceMotion === true ? LIGHTBOX_TRANSITION_NONE : LIGHTBOX_ENTER;
  const exitTransition = shouldReduceMotion === true ? LIGHTBOX_TRANSITION_NONE : LIGHTBOX_EXIT;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPortal forceMount>
        <AnimatePresence>
          {open ? (
            <>
              {/* Dim overlay */}
              <DialogPrimitive.Overlay forceMount asChild>
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={enterTransition}
                  className="fixed inset-0 z-50 bg-black/15"
                />
              </DialogPrimitive.Overlay>

              {/* Content — flexbox centering avoids blurry text from translate(-50%) */}
              <div className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none">
                <DialogPrimitive.Content forceMount asChild>
                  <motion.div
                    initial={{ opacity: 0, scale: 0.96 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.96 }}
                    transition={exitTransition}
                    style={{ willChange: 'transform, opacity' }}
                    className="pointer-events-auto w-[min(92vw,960px)] gap-0 overflow-hidden rounded-[24px] p-0 text-popover-foreground glass-surface"
                  >
                    <DialogTitle className="sr-only">Attached image preview</DialogTitle>
                    <DialogDescription className="sr-only">
                      Full-size preview for attached chat images. Use the left and right arrow keys
                      to navigate between images.
                    </DialogDescription>

                    <div className="relative flex max-h-[88vh] flex-col">
                      <div className="flex items-center justify-between gap-2 px-4 pt-2">
                        <div className="flex min-w-0 items-baseline gap-2">
                          <p className="truncate text-[13px] font-medium text-foreground">
                            {activeImage.name}
                          </p>
                          <p className="shrink-0 text-xs text-muted-foreground">
                            {safeIndex + 1}/{imageCount}
                          </p>
                        </div>

                        <DialogClose
                          aria-label="Close image preview"
                          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-black/5 dark:bg-white/10 text-muted-foreground transition-[background-color,color] duration-150 ease-out hover:!bg-[var(--lg-alert-destructive-bg-hover)] hover:!text-[var(--lg-alert-destructive-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:scale-[0.97] motion-reduce:transition-none"
                          style={{ touchAction: 'manipulation' }}
                        >
                          <X className="h-3.5 w-3.5" aria-hidden="true" />
                        </DialogClose>
                      </div>

                      <div className="relative flex min-h-[320px] flex-1 items-center justify-center px-2 pt-2 pb-2 sm:px-2 sm:pb-2">
                        {imageCount > 1 ? (
                          <>
                            <button
                              type="button"
                              onClick={selectPrevious}
                              aria-label="Previous image"
                              className="absolute left-3 top-1/2 z-10 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-black/10 text-foreground/85 dark:bg-black/45 dark:text-white/85 transition-[background-color,color,transform] duration-150 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:scale-[0.98] motion-reduce:transition-none"
                              style={{ touchAction: 'manipulation' }}
                            >
                              <ChevronLeft className="h-5 w-5" aria-hidden="true" />
                            </button>
                            <button
                              type="button"
                              onClick={selectNext}
                              aria-label="Next image"
                              className="absolute right-3 top-1/2 z-10 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-black/10 text-foreground/85 dark:bg-black/45 dark:text-white/85 transition-[background-color,color,transform] duration-150 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:scale-[0.98] motion-reduce:transition-none"
                              style={{ touchAction: 'manipulation' }}
                            >
                              <ChevronRight className="h-5 w-5" aria-hidden="true" />
                            </button>
                          </>
                        ) : null}

                        {isBroken ? (
                          <div className="flex h-full min-h-[320px] w-full items-center justify-center rounded-[20px] border border-dashed border-[var(--lg-separator)] bg-muted/50 px-8 text-center">
                            <div className="flex max-w-sm flex-col items-center gap-3">
                              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted">
                                <ImageOff
                                  className="h-6 w-6 text-muted-foreground"
                                  aria-hidden="true"
                                />
                              </div>
                              <div>
                                <p className="text-sm font-medium text-foreground">
                                  Preview unavailable
                                </p>
                                <p className="mt-1 text-xs text-muted-foreground">
                                  {activeImage.name}
                                </p>
                              </div>
                            </div>
                          </div>
                        ) : (
                          <SafeImage
                            key={activeImage.previewUrl}
                            src={activeImage.previewUrl}
                            alt={activeImage.name}
                            className="max-h-[72vh] w-full rounded-[20px] object-contain"
                            onError={() => {
                              setBrokenPreviewUrls((prev) => ({
                                ...prev,
                                [activeImage.previewUrl]: true,
                              }));
                            }}
                          />
                        )}
                      </div>
                    </div>
                  </motion.div>
                </DialogPrimitive.Content>
              </div>
            </>
          ) : null}
        </AnimatePresence>
      </DialogPortal>
    </Dialog>
  );
});

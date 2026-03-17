import { ImageOff } from 'lucide-react';
import { memo, useCallback, useEffect, useRef, useState } from 'react';

import { ImageLightbox } from './ImageLightbox';

import type { ImageAttachment } from '../input';
import type { FC } from 'react';

import { SafeImage } from '@/components/shared';

interface ImageAttachmentTilesProps {
  readonly attachedImages: readonly ImageAttachment[];
}

export const ImageAttachmentTiles: FC<ImageAttachmentTilesProps> = memo(
  function ImageAttachmentTiles({ attachedImages }) {
    const [activeIndex, setActiveIndex] = useState(0);
    const [lightboxOpen, setLightboxOpen] = useState(false);
    const [brokenPreviewUrls, setBrokenPreviewUrls] = useState<Record<string, true>>({});
    const triggerRefs = useRef<(HTMLButtonElement | null)[]>([]);
    const restoreIndexRef = useRef<number>(0);

    const openLightbox = useCallback((index: number) => {
      restoreIndexRef.current = index;
      setActiveIndex(index);
      setLightboxOpen(true);
    }, []);

    const handleOpenChange = useCallback((open: boolean) => {
      setLightboxOpen(open);
      if (!open) {
        const trigger = triggerRefs.current[restoreIndexRef.current];
        window.setTimeout(() => {
          trigger?.focus();
        }, 0);
      }
    }, []);

    useEffect(() => {
      setBrokenPreviewUrls({});
    }, [attachedImages]);

    return (
      <>
        <div className="flex flex-wrap justify-end gap-2">
          {attachedImages.map((image, index) => {
            const isBroken = brokenPreviewUrls[image.previewUrl] === true;

            return (
              <button
                key={`${image.name}-${String(index)}`}
                ref={(element) => {
                  triggerRefs.current[index] = element;
                }}
                type="button"
                title={image.name}
                aria-label={`Open attached image ${image.name}`}
                onClick={() => {
                  openLightbox(index);
                }}
                className="group relative flex h-20 w-20 items-center justify-center overflow-hidden rounded-2xl border border-border/60 bg-chat-area/70 shadow-sm transition-[border-color,box-shadow,transform] duration-150 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 active:scale-[0.98] motion-reduce:transition-none"
                style={{ touchAction: 'manipulation' }}
              >
                {isBroken ? (
                  <div className="flex h-full w-full flex-col items-center justify-center gap-1 bg-muted/30 px-2 text-center">
                    <ImageOff className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                    <span className="line-clamp-2 text-[10px] font-medium leading-tight text-muted-foreground">
                      {image.name}
                    </span>
                  </div>
                ) : (
                  <>
                    <SafeImage
                      src={image.previewUrl}
                      alt={image.name}
                      loading="lazy"
                      className="h-full w-full object-cover"
                      onError={() => {
                        setBrokenPreviewUrls((prev) => ({
                          ...prev,
                          [image.previewUrl]: true,
                        }));
                      }}
                    />
                    <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 via-black/35 to-transparent px-2 pb-1.5 pt-4">
                      <span className="block truncate text-[10px] font-medium text-white/90">
                        {image.name}
                      </span>
                    </div>
                  </>
                )}
              </button>
            );
          })}
        </div>

        <ImageLightbox
          attachedImages={attachedImages}
          currentIndex={activeIndex}
          onIndexChange={setActiveIndex}
          onOpenChange={handleOpenChange}
          open={lightboxOpen}
        />
      </>
    );
  }
);

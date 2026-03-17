import { createLogger } from '@orbit/common/lib';

import type { ImageAttachment } from '@/components/chat/input';

import { cacheImage } from '@/lib/api/image-cache';
import { useChatStore } from '@/stores/chat/chat-store';

const logger = createLogger('ImageAttachmentCache');

export function buildOptimisticAttachedImages(
  images?: readonly ImageAttachment[]
): ImageAttachment[] | undefined {
  if (!images || images.length === 0) {
    return undefined;
  }

  return images.map((image) => ({
    name: image.name,
    mimeType: image.mimeType,
    previewUrl: image.previewUrl,
  }));
}

export function cacheAttachedImagesForMessage(
  sessionId: string,
  messageId: string,
  images?: readonly ImageAttachment[]
): void {
  if (!images || images.length === 0) {
    return;
  }

  images.forEach((image) => {
    if (!image.data) {
      return;
    }

    void cacheImage(sessionId, image.name, image.mimeType, image.data)
      .then((assetUrl) => {
        useChatStore
          .getState()
          .patchImagePreviewUrl(sessionId, messageId, image.previewUrl, assetUrl);
      })
      .catch((error: unknown) => {
        logger.warn('Failed to cache image attachment', {
          error,
          imageName: image.name,
          messageId,
          sessionId,
        });
        useChatStore.getState().removeImageFromMessage(sessionId, messageId, image.previewUrl);
      });
  });
}

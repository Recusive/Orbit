import { memo, useCallback, useEffect, useRef, useState } from 'react';

import type { FC, ImgHTMLAttributes, SyntheticEvent } from 'react';

import { useChatStore } from '@/stores/chat/chat-store';

/**
 * Convert a base64 data: URL to a Blob. Returns null on malformed input.
 * Only handles `;base64` encoding — percent-encoded data URLs pass through unchanged.
 */
export function dataUrlToBlob(dataUrl: string): Blob | null {
  try {
    const commaIndex = dataUrl.indexOf(',');
    if (commaIndex === -1) {
      return null;
    }

    const header = dataUrl.slice(0, commaIndex);
    if (!header.includes(';base64')) {
      return null;
    }

    const base64 = dataUrl.slice(commaIndex + 1);
    const mime = /data:(.*?);/.exec(header)?.[1] ?? 'application/octet-stream';
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);

    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }

    return new Blob([bytes], { type: mime });
  } catch {
    return null;
  }
}

type DataUrlKind = 'base64' | 'invalid' | 'passthrough' | 'regular';

function getDataUrlKind(src: string): DataUrlKind {
  if (!src.startsWith('data:')) {
    return 'regular';
  }

  const commaIndex = src.indexOf(',');
  if (commaIndex === -1) {
    return 'invalid';
  }

  const header = src.slice(0, commaIndex);
  return header.includes(';base64') ? 'base64' : 'passthrough';
}

interface SafeImageProps extends ImgHTMLAttributes<HTMLImageElement> {
  readonly src: string;
  readonly layoutMutationSessionId?: string;
  readonly layoutMutationSource?: string;
  readonly layoutMutationTimeoutMs?: number;
}

/**
 * Drop-in <img> replacement that converts base64 data: URLs to opaque blob: URLs.
 *
 * Prevents large base64 payloads from appearing in the DOM while preserving
 * the original previewUrl in state for later cache patching.
 */
export const SafeImage: FC<SafeImageProps> = memo(function SafeImage({
  src,
  onError,
  onLoad,
  layoutMutationSessionId,
  layoutMutationSource,
  layoutMutationTimeoutMs,
  ...props
}) {
  const initialKind = getDataUrlKind(src);
  const [safeSrc, setSafeSrc] = useState<string>(
    initialKind === 'base64' || initialKind === 'invalid' ? '' : src
  );
  const [sanitizeFailed, setSanitizeFailed] = useState(initialKind === 'invalid');
  const blobUrlRef = useRef<string | null>(null);
  const onErrorRef = useRef(onError);
  const onLoadRef = useRef(onLoad);
  const layoutMutationTokenRef = useRef<string | null>(null);
  onErrorRef.current = onError;
  onLoadRef.current = onLoad;

  const finishLayoutMutation = useCallback((): void => {
    if (!layoutMutationSessionId || layoutMutationTokenRef.current === null) {
      return;
    }

    useChatStore
      .getState()
      .layoutMutationEnd(layoutMutationSessionId, layoutMutationTokenRef.current);
    layoutMutationTokenRef.current = null;
  }, [layoutMutationSessionId]);

  useEffect(() => {
    if (blobUrlRef.current !== null) {
      URL.revokeObjectURL(blobUrlRef.current);
      blobUrlRef.current = null;
    }

    const kind = getDataUrlKind(src);
    if (kind === 'regular' || kind === 'passthrough') {
      setSafeSrc(src);
      setSanitizeFailed(false);
      return;
    }

    if (kind === 'invalid') {
      setSafeSrc('');
      setSanitizeFailed(true);
      return;
    }

    const blob = dataUrlToBlob(src);
    if (blob === null) {
      setSafeSrc('');
      setSanitizeFailed(true);
      return;
    }

    const blobUrl = URL.createObjectURL(blob);
    blobUrlRef.current = blobUrl;
    setSafeSrc(blobUrl);
    setSanitizeFailed(false);

    return () => {
      URL.revokeObjectURL(blobUrl);
      blobUrlRef.current = null;
    };
  }, [src]);

  useEffect(() => {
    if (sanitizeFailed) {
      finishLayoutMutation();
      onErrorRef.current?.({} as SyntheticEvent<HTMLImageElement>);
    }
  }, [finishLayoutMutation, sanitizeFailed]);

  useEffect(() => {
    finishLayoutMutation();
    if (!layoutMutationSessionId || !layoutMutationSource || safeSrc === '') {
      return;
    }

    layoutMutationTokenRef.current = useChatStore
      .getState()
      .layoutMutationStart(layoutMutationSessionId, layoutMutationSource, layoutMutationTimeoutMs);

    return () => {
      finishLayoutMutation();
    };
  }, [
    finishLayoutMutation,
    layoutMutationSessionId,
    layoutMutationSource,
    layoutMutationTimeoutMs,
    safeSrc,
  ]);

  if (safeSrc === '') {
    return null;
  }

  return (
    <img
      {...props}
      src={safeSrc}
      onError={(event) => {
        finishLayoutMutation();
        onErrorRef.current?.(event);
      }}
      onLoad={(event) => {
        finishLayoutMutation();
        onLoadRef.current?.(event);
      }}
    />
  );
});
